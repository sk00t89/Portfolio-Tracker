import "./App.css";
import usePortfolioHistory from "./hooks/usePortfolioHistory.js";
import useManualAssets from "./hooks/useManualAssets.js";
import { normalizeQuoteTimestamp, quoteFreshnessReason, quoteValuationKey, VERIFIED_QUOTE_MAX_AGE } from "./utils/valuationFreshness.js";
import { evaluateLiveValuation } from "./utils/portfolioPeriod.js";
import Navbar from "./components/Navbar.jsx";
import InstallPrompt from "./components/InstallPrompt.jsx";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Holdings from "./pages/Holdings.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import Settings from "./pages/Settings.jsx";
import Help from "./pages/Help.jsx";
import {useEffect, useState, useRef} from "react";
import { createInFlightRequests } from "./utils/requestDeduplication.js";
import { runAtomicQuoteRefresh, mergeQuoteRefresh, portfolioDisplayValue, attachDailyReferences } from "./utils/atomicQuoteRefresh.js";
import getInstrumentKey from "./utils/instrumentKey.js";
import {
    calculatePortfolioValue,
    calculateLysaFundVolumes
} from "./utils/calculations.js";
import {
    getAveragePriceSek,
    getExchangeRate
} from "./services/currencyData.js";
import {findMatchingHolding} from "./utils/holdingMatching.js";
import {
    getYahooPrice,
    getNordnetPriceByIsin,
    getNordnetPriceByInstrumentId,
    getAvanzaPriceByIsin,
    getAvanzaPriceByInstrumentId,
    getFundNav
} from "./services/marketData.js";
import normalizeAssetType from "./utils/normalizeAssetType.js";
import classifyHolding from "./utils/classifyHolding.js";
import { createVerifiedQuoteBatch } from "./services/verifiedHoldingQuote.js";
import { getCryptoPrice } from "./services/cryptoData.js";
import {
    createTransaction,
    applyTransactionToHolding,
} from "./utils/transactions.js";
import {
    createPortfolioSnapshot,
    savePortfolioSnapshot,
    getPortfolioSnapshots,
    restorePortfolioSnapshot,
} from "./utils/portfolioSnapshots.js";
import {lysaFundIsins} from "./data/lysaFundIsins.js";
import {getLysaFundPrices} from "./services/lysaData.js";
import {
    deleteLysaData,
    getLysaPerformance as getDatabaseLysaPerformance,
    getLysaTransactions as getDatabaseLysaTransactions,
    saveLysaPerformance as saveDatabaseLysaPerformance,
    saveLysaTransactions as saveDatabaseLysaTransactions,
} from "./services/lysaDatabase.js";
import {
    enrichImportedHolding,
    searchHoldingCandidates,
} from "./services/holdingEnrichment.js";
import Login from "./pages/Login.jsx";
import { supabase } from "./lib/supabase.js";
import {
    createHolding as createDatabaseHolding,
    deleteAllHoldings,
    deleteHoldingById,
    getHoldings as getDatabaseHoldings,
    getOrCreateAccountForPlatform,
    updateHolding as updateDatabaseHolding,
    updateHoldingQuote as updateDatabaseHoldingQuote,
} from "./services/database.js";

const PRICE_UPDATE_INTERVAL = 20 * 60 * 1000;
const runPriceRefresh = createInFlightRequests();
const quoteProviders = { getYahooPrice, getNordnetPriceByIsin, getNordnetPriceByInstrumentId,
    getAvanzaPriceByIsin, getAvanzaPriceByInstrumentId, getCryptoPrice, getFundNav };



function App() {


    // =========================================
    // supabase
    // =========================================
    const [session, setSession] = useState(null);
    const userId = session?.user.id;
    const activeUser = useRef(userId);
    useEffect(() => { activeUser.current = userId; }, [userId]);
    const [holdings, setHoldings] = useState([]);
    const [holdingsLoading, setHoldingsLoading] = useState(true);
    const [holdingsLoadedUser, setHoldingsLoadedUser] = useState(null);
    const [lysaLoadedUser, setLysaLoadedUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const manualAssets = useManualAssets(session?.user.id);
    const assets = manualAssets.assets;
    const [priceUpdatesInProgress, setPriceUpdatesInProgress] = useState(0);
    const [refreshDisplay, setRefreshDisplay] = useState(null);
    const displayedValueRef = useRef(null);
    const [quoteChecks, setQuoteChecks] = useState({});
    const [quotePublication, setQuotePublication] = useState(null);
    const [lysaQuoteCheck, setLysaQuoteCheck] = useState({ success: false, checkedAt: null });

    const [theme, setTheme] = useState(() => {
        const savedTheme =
            localStorage.getItem("theme");

        if (
            savedTheme === "light" ||
            savedTheme === "dark"
        ) {
            return savedTheme;
        }

        const systemPrefersLight =
            window.matchMedia?.(
                "(prefers-color-scheme: light)"
            ).matches;

        return systemPrefersLight
            ? "light"
            : "dark";
    });

    useEffect(() => {
        document.documentElement.dataset.theme =
            theme;
    }, [theme]);

    const toggleTheme = () => {
        setTheme((currentTheme) => {
            const nextTheme =
                currentTheme === "dark"
                    ? "light"
                    : "dark";

            localStorage.setItem(
                "theme",
                nextTheme
            );

            document.documentElement.dataset.theme =
                nextTheme;

            return nextTheme;
        });
    };

    

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setAuthLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                setHoldings([]);
                setHoldingsLoading(false);
            }

            setSession(session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // =========================================
    // HOLDINGS: priser, berikning, matchning och transaktioner
    // =========================================
    const performHoldingPriceUpdate = async (id, loadQuote, onDiagnostics, staged = false) => {
        const holding = holdings.find(
            (holding) => holding.id === id
        );

        if (!holding) {
            return;
        }

        const expectedUser = userId;
        const data = await loadQuote(holding, onDiagnostics);

        if (!data?.price) {
            console.warn(
                "Ingen giltig kurs hittades för:",
                holding.name
            );
            return;
        }
        const priceCurrency =
            data.currency ?? holding.currency;

        let currentValueSek = null;

        if (data.price && holding.quantity) {
            if (priceCurrency === "SEK") {
                currentValueSek =
                    holding.quantity * data.price;
            } else if (priceCurrency) {
                const exchangeRate =
                    await getExchangeRate(
                        priceCurrency,
                        "SEK"
                    );

                currentValueSek =
                    holding.quantity *
                    data.price *
                    exchangeRate;
            }
        }

        const updatedHolding = {
            ...holding,
            currentPrice: data.price,
            currency: priceCurrency,
            previousClose: data.previousClose ?? null,
            currentValueSek,
            priceUpdatedAt: normalizeQuoteTimestamp(data.timestamp),
        };
        if (activeUser.current !== expectedUser) return;
        if (quoteFreshnessReason(updatedHolding)) return;

        const {
            data: savedHolding,
            error: saveError,
        } = await updateDatabaseHoldingQuote(
            id,
            updatedHolding,
            holding,
            expectedUser
        );

        if (saveError) {
            console.error(
                "Kunde inte spara uppdaterad kurs i Supabase:",
                holding.name,
                saveError
            );
            return;
        }

        if (activeUser.current !== expectedUser) return;
        if (!staged) setHoldings((previousHoldings) =>
            previousHoldings.map((item) =>
                item.id === id
                    ? savedHolding
                    : item
            )
        );
        return { holding: savedHolding, checkedAt: data.checkedAt };
    };

    const updateAllHoldingPrices = async (
        forceUpdate = false,
        now
    ) => {
        return runPriceRefresh(userId, async () => {
            if (!userId || activeUser.current !== userId) return;
            const lastUpdate = Number(
                localStorage.getItem("lastPriceUpdate")
            ) || 0;

            const pricesAreFresh =
                now - lastUpdate < PRICE_UPDATE_INTERVAL;

            const allQuotesVerified = holdings.every((holding) => {
                const check = quoteChecks[holding.id];
                return check?.success && check.userId === session?.user.id &&
                    check.valueKey === quoteValuationKey(holding) && now - check.checkedAt <= VERIFIED_QUOTE_MAX_AGE;
            });
            if (pricesAreFresh && !forceUpdate && allQuotesVerified) {
                console.log("Kurserna är fortfarande färska");
                return;
            }

            // Start the asynchronous refresh after the current render/effect has completed.
            await Promise.resolve();
            setRefreshDisplay({ userId, value: displayedValueRef.current?.userId === userId ? displayedValueRef.current.value : null });
            setPriceUpdatesInProgress((count) => count + 1);
            const loadQuote = createVerifiedQuoteBatch(userId, quoteProviders);
            let published = false;
            try {
                const lysaRefresh = forceUpdate ? getLysaFundPrices().then(
                    (prices) => ({ prices, success: true, checkedAt: Date.now() }),
                    () => ({ prices: null, success: false, checkedAt: Date.now() })
                ) : Promise.resolve(null);
                await runAtomicQuoteRefresh({
                    holdings,
                    isCurrent: () => activeUser.current === userId,
                    refresh: async (holding) => {
                        let diagnostics = [];
                        const result = await performHoldingPriceUpdate(holding.id, loadQuote,
                            (value) => { diagnostics = value; }, true);
                        return { ...result, diagnostics };
                    },
                    commit: async (results) => {
                        const lysaResult = await lysaRefresh;
                        if (activeUser.current !== userId) return;
                        // React batches these synchronous state updates into one publication.
                        setHoldings((current) => mergeQuoteRefresh(current, results, userId).holdings);
                        const checks = mergeQuoteRefresh(holdings, results, userId).checks;
                        setQuoteChecks((current) => ({ ...current, ...checks }));
                        if (lysaResult) {
                            if (lysaResult.prices) setLysaFundPrices(lysaResult.prices);
                            setLysaQuoteCheck({ success: lysaResult.success, checkedAt: lysaResult.checkedAt });
                        }
                        setPriceUpdatesInProgress((count) => count - 1);
                        setQuotePublication({ userId, observedAt: Date.now() });
                        published = true;
                    },
                });
            localStorage.setItem(
                "lastPriceUpdate",
                String(now)
            );
            } finally {
                if (!published) setPriceUpdatesInProgress((count) => count - 1);
            }
        });
    };


    const enrichHoldingSmart = async (id) => {
        const holding = holdings.find(
            (holding) => holding.id === id
        );

        if (!holding) {
            return;
        }

        const internalMatch = findMatchingHolding(
            holding,
            holdings
        );

        if (internalMatch) {
            const updatedHolding = classifyHolding({
                ...holding,
                ticker:
                    holding.ticker ??
                    internalMatch.ticker,
                isin:
                    holding.isin ??
                    internalMatch.isin,
                assetType:
                    holding.assetType ??
                    internalMatch.assetType,
                currency:
                    holding.currency ??
                    internalMatch.currency,
                country:
                    holding.country ??
                    internalMatch.country,
                market:
                    holding.market ??
                    internalMatch.market,
                instrumentId:
                    holding.instrumentId ??
                    internalMatch.instrumentId ??
                    null,
                provider:
                    holding.provider ??
                    internalMatch.provider ??
                    null,
            });

            const {
                data: savedHolding,
                error,
            } = await updateDatabaseHolding(
                id,
                updatedHolding
            );

            if (error) {
                console.error(
                    "Kunde inte spara intern matchning i Supabase:",
                    error
                );
                return;
            }

            setHoldings((prevHoldings) =>
                prevHoldings.map((item) =>
                    item.id === id
                        ? savedHolding
                        : item
                )
            );

            return;
        }


        const automaticallyEnriched =
            await enrichImportedHolding(holding);

        const identityChanged =
            automaticallyEnriched.isin !== holding.isin ||
            automaticallyEnriched.ticker !== holding.ticker ||
            automaticallyEnriched.instrumentId !== holding.instrumentId ||
            automaticallyEnriched.assetType !== holding.assetType ||
            automaticallyEnriched.provider !== holding.provider;

        if (identityChanged) {
            const classifiedHolding =
                classifyHolding({
                    ...automaticallyEnriched,
                    assetType: normalizeAssetType(
                        automaticallyEnriched.assetType
                    ),
                });

            const {
                data: savedHolding,
                error,
            } = await updateDatabaseHolding(
                id,
                classifiedHolding
            );

            if (error) {
                console.error(
                    "Kunde inte spara automatisk berikning i Supabase:",
                    error
                );
            } else {
                setHoldings((prevHoldings) =>
                    prevHoldings.map((item) =>
                        item.id === id
                            ? savedHolding
                            : item
                    )
                );
                return;
            }
        }

        const query =
            holding.ticker ?? holding.name;

        const candidates =
            await searchHoldingCandidates(query);

        setEnrichmentCandidates({
            holdingId: holding.id,
            holdingName: holding.name,
            candidates,
        });
    };

    const selectEnrichmentCandidate = async (candidate) => {
        if (!enrichmentCandidates) {
            return;
        }

        await enrichHolding(
            enrichmentCandidates.holdingId,
            candidate
        );

        setEnrichmentCandidates(null);
    };

    const searchEnrichmentCandidates = async (query) => {
        if (!enrichmentCandidates || !query.trim()) {
            return;
        }

        const candidates =
            await searchHoldingCandidates(
                query.trim()
            );

        setEnrichmentCandidates((previous) => ({
            ...previous,
            candidates,
        }));
    };


    const enrichMissingAveragePrices = async () => {
        const updatedHoldings = [];

        for (const holding of holdings) {
            if (
                holding.averagePriceSek === null &&
                holding.averagePrice &&
                holding.currency
            ) {
                const averagePriceSek =
                    await getAveragePriceSek(holding);

                const updatedHolding = {
                    ...holding,
                    averagePriceSek:
                        averagePriceSek ??
                        holding.averagePriceSek,
                };

                const {
                    data: savedHolding,
                    error,
                } = await updateDatabaseHolding(
                    holding.id,
                    updatedHolding
                );

                if (error) {
                    console.error(
                        "Kunde inte spara berikat GAV i Supabase:",
                        holding.name,
                        error
                    );
                    updatedHoldings.push(holding);
                    continue;
                }

                updatedHoldings.push(savedHolding);
                continue;
            }

            updatedHoldings.push(holding);
        }

        setHoldings(updatedHoldings);
    };


    const handleTransaction = async (
        holdingId,
        transactionData
    ) => {
        let fxRateToSek = 1;

        if (
            transactionData.currency &&
            transactionData.currency !== "SEK"
        ) {
            fxRateToSek = await getExchangeRate(
                transactionData.currency,
                "SEK"
            );
        }

        const transaction = createTransaction({
            holdingId,
            ...transactionData,
            fxRateToSek,
        });

        setHoldings((currentHoldings) =>
            currentHoldings
                .map((holding) =>
                    holding.id === holdingId
                        ? applyTransactionToHolding(
                            holding,
                            transaction
                        )
                        : holding
                )
                .filter((holding) => holding.quantity > 0)
        );

        setTransactions((currentTransactions) => [
            ...currentTransactions,
            transaction,
        ]);
    };

    // =========================================
    // SNAPSHOT
    // =========================================

    const handleRestoreSnapshot = async (snapshot) => {
        const currentSnapshot = createPortfolioSnapshot({
            holdings,
            assets,
            transactions,
            lysaTransactions,
            lysaPerformance,
            resolvedMatches,
        });

        savePortfolioSnapshot(currentSnapshot);

        const restoredData =
            restorePortfolioSnapshot(snapshot);

        if (!await manualAssets.replaceAssets(restoredData.assets)) return;

        setHoldings(restoredData.holdings);
        setTransactions(restoredData.transactions);
        setLysaTransactions(restoredData.lysaTransactions);
        setLysaPerformance(restoredData.lysaPerformance);
        setResolvedMatches(restoredData.resolvedMatches);
    };


    // =========================================
    // STATE
    // =========================================

    const [enrichmentCandidates, setEnrichmentCandidates] = useState(null);

    const [resolvedMatches, setResolvedMatches] = useState(() => {
        const savedMatches = localStorage.getItem("resolvedMatches");

        return savedMatches
            ? JSON.parse(savedMatches)
            : [];
    });



    useEffect(() => {
        if (!userId) {
            return;
        }

        let cancelled = false;
        const loadHoldings = async () => {
            setHoldingsLoading(true);
            setHoldingsLoadedUser(null);

            const { data, error } =
                await getDatabaseHoldings();

            if (error) {
                console.error(
                    "Kunde inte hämta holdings från Supabase:",
                    error
                );
                setHoldingsLoading(false);
                return;
            }

            const repairedHoldings = [];
            const accountCache = new Map();

            for (const holding of data) {
                if (cancelled) return;
                let workingHolding = holding;

                if (!workingHolding.accountId && workingHolding.platform) {
                    try {
                        let accountId =
                            accountCache.get(workingHolding.platform);

                        if (!accountId) {
                            const {
                                data: account,
                                error: accountError,
                            } = await getOrCreateAccountForPlatform(
                                workingHolding.platform
                            );

                            if (!accountError) {
                                accountId = account?.id ?? null;
                                accountCache.set(
                                    workingHolding.platform,
                                    accountId
                                );
                            }
                        }

                        if (accountId) {
                            workingHolding = {
                                ...workingHolding,
                                accountId,
                            };
                        }
                    } catch (accountRepairError) {
                        console.warn(
                            "Kunde inte koppla konto för:",
                            workingHolding.name,
                            accountRepairError
                        );
                    }
                }

                const needsMetadata =
                    !workingHolding.isin ||
                    !workingHolding.instrumentId ||
                    !workingHolding.assetType ||
                    (
                        workingHolding.assetType === "STOCK" &&
                        !workingHolding.ticker
                    );

                let candidateHolding = workingHolding;

                if (
                    candidateHolding.averagePriceSek === null &&
                    candidateHolding.averagePrice &&
                    candidateHolding.currency
                ) {
                    try {
                        const averagePriceSek =
                            await getAveragePriceSek(
                                candidateHolding
                            );

                        candidateHolding = {
                            ...candidateHolding,
                            averagePriceSek:
                                averagePriceSek ??
                                candidateHolding.averagePriceSek,
                        };
                    } catch (gavRepairError) {
                        console.warn(
                            "Kunde inte berika GAV för:",
                            candidateHolding.name,
                            gavRepairError
                        );
                    }
                }

                if (needsMetadata) {
                    try {
                        const enrichedHolding =
                            await enrichImportedHolding(
                                candidateHolding
                            );

                        candidateHolding =
                            classifyHolding({
                                ...enrichedHolding,
                                assetType: normalizeAssetType(
                                    enrichedHolding.assetType
                                ),
                            });
                    } catch (repairError) {
                        console.warn(
                            "Automatisk berikning misslyckades för:",
                            workingHolding.name,
                            repairError
                        );
                    }
                }

                const shouldPersistRepair =
                    candidateHolding.accountId !== holding.accountId ||
                    candidateHolding.instrumentId !== holding.instrumentId ||
                    candidateHolding.isin !== holding.isin ||
                    candidateHolding.ticker !== holding.ticker ||
                    candidateHolding.assetType !== holding.assetType ||
                    candidateHolding.provider !== holding.provider ||
                    candidateHolding.category !== holding.category ||
                    candidateHolding.productType !== holding.productType ||
                    candidateHolding.underlying !== holding.underlying ||
                    candidateHolding.averagePriceSek !== holding.averagePriceSek;

                if (!shouldPersistRepair) {
                    repairedHoldings.push(candidateHolding);
                    continue;
                }

                const {
                    data: savedHolding,
                    error: repairError,
                } = await updateDatabaseHolding(
                    holding.id,
                    candidateHolding
                );

                if (repairError) {
                    console.warn(
                        "Kunde inte spara automatisk reparation för:",
                        holding.name,
                        repairError
                    );
                    repairedHoldings.push(candidateHolding);
                    continue;
                }

                repairedHoldings.push(savedHolding);
            }

            if (cancelled) return;
            setHoldings(repairedHoldings);
            setHoldingsLoadedUser(userId);
            setHoldingsLoading(false);
        };

        void loadHoldings();
        return () => { cancelled = true; };
    }, [userId]);


    const [lysaTransactions, setLysaTransactions] = useState([]);
    const [lysaPerformance, setLysaPerformance] = useState([]);
    const [lysaDataLoading, setLysaDataLoading] = useState(true);

    const [transactions, setTransactions] = useState(() => {
        const savedTransactions =
            localStorage.getItem("transactions");

        return savedTransactions
            ? JSON.parse(savedTransactions)
            : [];
    });

    const [lysaFundPrices, setLysaFundPrices] =
        useState({});

    // =========================================
    // HOLDINGS: import och instrumentdata
    // =========================================

    const enrichHolding = async (id, data) => {
        const holding = holdings.find(
            (holding) => holding.id === id
        );

        if (!holding) {
            return;
        }

        const averagePriceSek = await getAveragePriceSek(holding);

        const updatedHolding = classifyHolding({
            ...holding,
            ticker: holding.ticker ?? data.ticker,
            isin: holding.isin ?? data.isin,
            assetType:
                holding.assetType ??
                normalizeAssetType(data.assetType),
            currency: holding.currency ?? data.currency,
            country: holding.country ?? data.country,
            market:
                holding.market ??
                data.market ??
                data.exchange,
            instrumentId:
                holding.instrumentId ??
                data.instrumentId ??
                null,
            provider:
                holding.provider ??
                data.provider ??
                null,
            currentPrice:
                holding.currentPrice ??
                data.price ??
                null,
            averagePriceSek:
                averagePriceSek ?? holding.averagePriceSek,
        });

        const {
            data: savedHolding,
            error,
        } = await updateDatabaseHolding(
            id,
            updatedHolding
        );

        if (error) {
            console.error(
                "Kunde inte spara berikad holding i Supabase:",
                error
            );
            return;
        }

        setHoldings((prevHoldings) =>
            prevHoldings.map((item) =>
                item.id === id
                    ? savedHolding
                    : item
            )
        );
    };


    const findPossibleMatches = (holdings, resolvedMatches) => {
        const result = [];

        for (let i = 0; i < holdings.length; i++) {
            for (let j = i + 1; j < holdings.length; j++) {
                const firstHolding = holdings[i];
                const secondHolding = holdings[j];

                const alreadyResolved = resolvedMatches.some(
                    (match) =>
                        match.firstId === firstHolding.id &&
                        match.secondId === secondHolding.id
                );

                if (alreadyResolved) {
                    continue;
                }

                const sameIsin =
                    firstHolding.isin &&
                    secondHolding.isin &&
                    firstHolding.isin === secondHolding.isin;

                const sameName =
                    firstHolding.name.toLowerCase().trim() ===
                    secondHolding.name.toLowerCase().trim();

                const sameTicker =
                    firstHolding.ticker &&
                    secondHolding.ticker &&
                    firstHolding.ticker === secondHolding.ticker;

                if (sameIsin || sameName || sameTicker) {
                    result.push({
                        firstId: firstHolding.id,
                        secondId: secondHolding.id,
                        firstName: firstHolding.name,
                        secondName: secondHolding.name,
                    });
                }
            }
        }

        return result;
    };


    const confirmMatch = (firstId, secondId) => {
        setHoldings((prevHoldings) => {
            const firstHolding = prevHoldings.find(
                (holding) => holding.id === firstId
            );

            const secondHolding = prevHoldings.find(
                (holding) => holding.id === secondId
            );

            const sourceHolding =
                firstHolding.isin ? firstHolding : secondHolding;

            const targetHolding =
                firstHolding.isin ? secondHolding : firstHolding;

            return prevHoldings.map((holding) => {
                if (holding.id !== targetHolding.id) {
                    return holding;
                }

                const updatedHolding = {
                    ...holding,
                    isin: sourceHolding.isin ?? holding.isin,
                    ticker: sourceHolding.ticker ?? holding.ticker,
                    country: sourceHolding.country ?? holding.country,
                    market: sourceHolding.market ?? holding.market,
                    assetType: sourceHolding.assetType ?? holding.assetType,
                };

                return classifyHolding(updatedHolding);
            });
        });
    };

    const resolveMatch = (firstId, secondId) => {
        setResolvedMatches((prev) => [
            ...prev,
            {firstId, secondId}
        ]);
    };


    const possibleMatches = findPossibleMatches(
        holdings,
        resolvedMatches
    );

    const holdingsNeedingEnrichment =
        holdings.filter((holding) => {
            if (holding.platform === "Lysa") {
                return false;
            }

            const hasIdentifier =
                Boolean(holding.isin) ||
                Boolean(holding.instrumentId) ||
                Boolean(holding.ticker);

            return (
                !holding.assetType ||
                !hasIdentifier
            );
        }).length;

    const holdingsAttentionCount =
        possibleMatches.length +
        holdingsNeedingEnrichment;


    // =========================================
    // LOCAL STORAGE / STARTUP
    // Övrig data ligger kvar lokalt tills den migreras.
    // Holdings laddas nu från Supabase.
    // =========================================

    useEffect(() => {
        localStorage.setItem(
            "resolvedMatches",
            JSON.stringify(resolvedMatches)
        );
    }, [resolvedMatches]);

    useEffect(() => {
        localStorage.setItem(
            "transactions",
            JSON.stringify(transactions)
        );
    }, [transactions]);



    useEffect(() => {
        if (!session) {
            let cancelled = false;
            queueMicrotask(() => {
                if (!cancelled) { setLysaTransactions([]); setLysaPerformance([]); setLysaDataLoading(false); }
            });
            return () => { cancelled = true; };
        }

        const loadLysaData = async () => {
            setLysaDataLoading(true);
            setLysaLoadedUser(null);

            const [
                transactionsResult,
                performanceResult,
            ] = await Promise.all([
                getDatabaseLysaTransactions(),
                getDatabaseLysaPerformance(),
            ]);

            if (transactionsResult.error) {
                console.error(
                    "Kunde inte hämta Lysa-transaktioner från Supabase:",
                    transactionsResult.error
                );
            }

            if (performanceResult.error) {
                console.error(
                    "Kunde inte hämta Lysa-performance från Supabase:",
                    performanceResult.error
                );
            }

            let cloudTransactions =
                transactionsResult.data ?? [];
            let cloudPerformance =
                performanceResult.data ?? [];

            // Engångsmigrering från äldre lokal lagring på den enhet
            // där Lysa-filerna redan importerats.
            if (cloudTransactions.length === 0) {
                const savedTransactions =
                    localStorage.getItem(
                        "lysaTransactions"
                    );

                if (savedTransactions) {
                    try {
                        const localTransactions =
                            JSON.parse(
                                savedTransactions
                            );

                        if (
                            Array.isArray(
                                localTransactions
                            ) &&
                            localTransactions.length > 0
                        ) {
                            const { error } =
                                await saveDatabaseLysaTransactions(
                                    localTransactions
                                );

                            if (!error) {
                                cloudTransactions =
                                    localTransactions;
                            }
                        }
                    } catch (error) {
                        console.warn(
                            "Kunde inte migrera lokala Lysa-transaktioner:",
                            error
                        );
                    }
                }
            }

            if (cloudPerformance.length === 0) {
                const savedPerformance =
                    localStorage.getItem(
                        "lysaPerformance"
                    );

                if (savedPerformance) {
                    try {
                        const localPerformance =
                            JSON.parse(
                                savedPerformance
                            );

                        if (
                            Array.isArray(
                                localPerformance
                            ) &&
                            localPerformance.length > 0
                        ) {
                            const { error } =
                                await saveDatabaseLysaPerformance(
                                    localPerformance
                                );

                            if (!error) {
                                cloudPerformance =
                                    localPerformance;
                            }
                        }
                    } catch (error) {
                        console.warn(
                            "Kunde inte migrera lokal Lysa-performance:",
                            error
                        );
                    }
                }
            }

            setLysaTransactions(
                cloudTransactions
            );
            setLysaPerformance(
                cloudPerformance
            );
            setLysaDataLoading(false);
            if (!transactionsResult.error && !performanceResult.error) {
                setLysaLoadedUser(session.user.id);
            }
        };

        void loadLysaData();
    }, [session]);

    // =========================================
    // LYSA: importerad historik och visningsdata
    // =========================================

    const importLysaTransactions = async (transactions) => {
        const { error } =
            await saveDatabaseLysaTransactions(
                transactions
            );

        if (error) {
            console.error(
                "Kunde inte spara Lysa-transaktioner i Supabase:",
                error
            );
            return;
        }

        setLysaTransactions(transactions);
        localStorage.removeItem(
            "lysaTransactions"
        );
    };

    const importLysaPerformance = async (performance) => {
        const { error } =
            await saveDatabaseLysaPerformance(
                performance
            );

        if (error) {
            console.error(
                "Kunde inte spara Lysa-performance i Supabase:",
                error
            );
            return;
        }

        setLysaPerformance(performance);
        localStorage.removeItem(
            "lysaPerformance"
        );
    };

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const loadLysaFundPrices = async () => {
            try {
                const prices =
                    await getLysaFundPrices();

                if (cancelled) return;
                setLysaFundPrices(prices);
                setLysaQuoteCheck({ success: true, checkedAt: Date.now() });

            } catch (error) {
                if (cancelled) return;
                setLysaQuoteCheck({ success: false, checkedAt: Date.now() });
                console.error(
                    "Kunde inte uppdatera Lysa:",
                    error
                );
            }
        };

       void loadLysaFundPrices();
       return () => { cancelled = true; };
    }, [userId]);

    const lysaFundVolumes =
        calculateLysaFundVolumes(lysaTransactions);

    const lysaHoldings = Object.entries(lysaFundVolumes)
        .filter(([, volume]) => volume > 0)
        .map(([name, volume]) => {
            const isin =
                lysaFundIsins[name] ?? null;

            const priceData =
                isin
                    ? lysaFundPrices[isin]
                    : null;

            const currentPrice =
                priceData?.price ?? null;

            return {
                id: `lysa-${name}`,
                name,
                quantity: volume,
                platform: "Lysa",
                assetType: "FUND",
                category: "FUND",
                currency: "SEK",
                isin,
                currentPrice,
                quoteStale: lysaQuoteCheck.checkedAt != null && !lysaQuoteCheck.success,
                currentValueSek:
                    currentPrice
                        ? volume * currentPrice
                        : null,
                priceUpdatedAt:
                    priceData?.date ?? null,
                dailyQuoteCheck: { checkedAt: lysaQuoteCheck.checkedAt, source: "Lysa" },
                dailyReference: { nav: priceData?.navComparison },
            };
        });

    const lysaValue = lysaHoldings.reduce(
        (total, holding) =>
            total + (holding.currentValueSek ?? 0),
        0
    );

    const holdingsForDisplay = [
        ...holdings,
        ...lysaHoldings
    ];


    // =========================================
    // HOLDINGS: import, gruppering och borttagning
    // =========================================

    const importHoldings = async (newHoldings) => {
        let finalHoldings = [...holdings];
        const accountCache = new Map();

        for (const newHolding of newHoldings) {
            let enrichedHolding = newHolding;

            try {
                enrichedHolding =
                    await enrichImportedHolding(newHolding);
            } catch (error) {
                console.warn(
                    "Automatisk berikning misslyckades för:",
                    newHolding.name,
                    error
                );
            }

            let holdingWithGav = enrichedHolding;

            if (
                holdingWithGav.averagePriceSek == null &&
                holdingWithGav.averagePrice &&
                holdingWithGav.currency
            ) {
                try {
                    const averagePriceSek =
                        await getAveragePriceSek(
                            holdingWithGav
                        );

                    holdingWithGav = {
                        ...holdingWithGav,
                        averagePriceSek:
                            averagePriceSek ??
                            holdingWithGav.averagePriceSek,
                    };
                } catch (gavError) {
                    console.warn(
                        "Kunde inte berika GAV vid import för:",
                        holdingWithGav.name,
                        gavError
                    );
                }
            }

            const normalizedHolding = {
                ...holdingWithGav,
                assetType: normalizeAssetType(
                    holdingWithGav.assetType
                ),
            };

            const classifiedHolding =
                classifyHolding(normalizedHolding);

            let accountId = null;
            const platform = classifiedHolding.platform?.trim();

            if (platform) {
                if (accountCache.has(platform)) {
                    accountId = accountCache.get(platform);
                } else {
                    const {
                        data: account,
                        error: accountError,
                    } = await getOrCreateAccountForPlatform(platform);

                    if (accountError) {
                        console.error(
                            "Kunde inte hitta/skapa konto i Supabase:",
                            accountError
                        );
                        continue;
                    }

                    accountId = account?.id ?? null;
                    accountCache.set(platform, accountId);
                }
            }

            const holdingWithAccount = {
                ...classifiedHolding,
                accountId,
            };

            const newKey =
                getInstrumentKey(holdingWithAccount);

            const existingHolding = finalHoldings.find((oldHolding) => {
                return (
                    oldHolding.platform === holdingWithAccount.platform &&
                    getInstrumentKey(oldHolding) === newKey
                );
            });

            if (existingHolding) {
                const mergedHolding = {
                    ...existingHolding,
                    ...holdingWithAccount,
                    id: existingHolding.id,
                };

                const { data, error } =
                    await updateDatabaseHolding(
                        existingHolding.id,
                        mergedHolding
                    );

                if (error) {
                    console.error(
                        "Kunde inte uppdatera holding i Supabase:",
                        error
                    );
                    continue;
                }

                finalHoldings = finalHoldings.map((holding) =>
                    holding.id === existingHolding.id
                        ? data
                        : holding
                );
            } else {
                const { data, error } =
                    await createDatabaseHolding(holdingWithAccount);

                if (error) {
                    console.error(
                        "Kunde inte skapa holding i Supabase:",
                        error
                    );
                    continue;
                }

                finalHoldings.push(data);
            }
        }

        setHoldings(finalHoldings);
    };


    const groupHoldingsByInstrument = (holdings) => {
        return holdings.reduce((groups, holding) => {
            const instrumentKey =
                holding.isin ||
                holding.ticker ||
                holding.name.toLowerCase().trim();

            const existingGroup = groups.find(
                (group) => group.instrumentKey === instrumentKey
            );

            if (!existingGroup) {
                groups.push({
                    instrumentKey,
                    name: holding.name,
                    totalValue:
                        holding.currentValueSek ??
                        holding.valueSek ??
                        0,
                    positions: [holding],
                });
            } else {
                existingGroup.totalValue +=
                    holding.currentValueSek ??
                    holding.valueSek ??
                    0;
                existingGroup.positions.push(holding);
            }

            return groups;
        }, []);
    };


    const groupedHoldings = groupHoldingsByInstrument(holdingsForDisplay);

    // =========================================
    // MANUELLA TILLGÅNGAR
    // =========================================


    useEffect(() => {
        if (holdingsLoading || holdings.length === 0) {
            return;
        }

        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) void updateAllHoldingPrices(false, Date.now());
        });
        return () => { cancelled = true; };

        // Kör när holdings har laddats från Supabase.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [holdingsLoading]);

    const deleteHolding = async (id) => {
        const { error } = await deleteHoldingById(id);

        if (error) {
            console.error(
                "Kunde inte ta bort holding från Supabase:",
                error
            );
            return;
        }

        setHoldings((previousHoldings) =>
            previousHoldings.filter(
                (holding) => holding.id !== id
            )
        );
    };

    const resetPortfolio = async () => {
        if (!await manualAssets.replaceAssets([])) return;
        const { error } = await deleteAllHoldings();

        if (error) {
            console.error(
                "Kunde inte återställa holdings i Supabase:",
                error
            );
            return;
        }

        const { error: lysaDeleteError } =
            await deleteLysaData();

        if (lysaDeleteError) {
            console.error(
                "Kunde inte återställa Lysa-data i Supabase:",
                lysaDeleteError
            );
            return;
        }

        setHoldings([]);
        setResolvedMatches([]);
        setLysaPerformance([]);
        setLysaTransactions([]);
        setTransactions([]);
    };

    const portfolioValue = calculatePortfolioValue(
        holdings,
        assets,
        lysaValue
    );

    const historyReady = Boolean(session &&
        manualAssets.ready && !manualAssets.busy &&
        holdingsLoadedUser === session.user.id && lysaLoadedUser === session.user.id &&
        !holdingsLoading && !lysaDataLoading && priceUpdatesInProgress === 0 &&
        lysaHoldings.every((holding) => Number(holding.currentPrice) > 0) &&
        holdings.every((holding) => {
            const value = holding.currentValueSek ?? holding.valueSek;
            return value != null && Number.isFinite(Number(value));
        }));
    const valuationInputs = {
        userId: session?.user.id,
        holdings: holdingsForDisplay,
        checks: { ...quoteChecks, ...Object.fromEntries(lysaHoldings.map((holding) => [holding.id, {
            ...lysaQuoteCheck, valueKey: quoteValuationKey(holding),
        }])) },
    };
    const portfolioHistory = usePortfolioHistory(session?.user.id, portfolioValue, historyReady, valuationInputs);
    const valuesLoading = holdingsLoadedUser !== userId || lysaLoadedUser !== userId || holdingsLoading || lysaDataLoading || !manualAssets.ready || lysaHoldings.some((holding) => holding.currentPrice == null);
    const savedPortfolioValue = portfolioHistory.points.at(-1)?.valueSek ?? null;
    const displayedPortfolioValue = portfolioDisplayValue({ currentValue: portfolioValue, savedValue: savedPortfolioValue,
        valuesLoading, updating: priceUpdatesInProgress > 0, refreshDisplay, userId });
    useEffect(() => { displayedValueRef.current = { userId, value: displayedPortfolioValue }; }, [userId, displayedPortfolioValue]);

    useEffect(() => {
        const snapshots = getPortfolioSnapshots();
        const latestSnapshot = snapshots[0];

        const lastCreatedAt =
            latestSnapshot?.createdAt
                ? new Date(latestSnapshot.createdAt).getTime()
                : 0;

        const twentyFourHours =
            24 * 60 * 60 * 1000;

        const shouldCreateSnapshot =
            // eslint-disable-next-line react-hooks/purity -- This clock read runs exclusively inside useEffect, never during render.
            Date.now() - lastCreatedAt >= twentyFourHours;

        if (!shouldCreateSnapshot) {
            return;
        }

        const snapshot = createPortfolioSnapshot({
            holdings,
            assets,
            transactions,
            lysaTransactions,
            lysaPerformance,
            resolvedMatches,
        });

        savePortfolioSnapshot(snapshot);
    }, [
        holdings,
        assets,
        transactions,
        lysaTransactions,
        lysaPerformance,
        resolvedMatches,
    ]);

    if (authLoading) {
        return <div>Laddar...</div>;
    }

    if (!session) {
        return <Login />;
    }



    return (
        <div className="app-shell">

            <Navbar
                session={session}
                holdingsAttentionCount={
                    holdingsAttentionCount
                }
                theme={theme}
                onToggleTheme={toggleTheme}
            />
            <Routes>
                <Route path="/" element={
                    <Dashboard
                        userId={userId}
                        portfolioHistory={portfolioHistory}
                        liveValuation={evaluateLiveValuation({ publication: quotePublication,
                            ready: !valuesLoading, inputs: valuationInputs })}
                        historyReady={historyReady}
                        dailyHoldings={attachDailyReferences(holdingsForDisplay, quoteChecks, userId)}
                        updatingPrices={priceUpdatesInProgress > 0}
                        valuesLoading={valuesLoading}
                        transactions={transactions}
                        assets={assets}
                        manualAssets={manualAssets}
                        userEmail={session.user.email}
                        holdings={holdings}
                        portfolioValue={displayedPortfolioValue}
                        lysaValue={lysaValue}
                        importHoldings={importHoldings}
                        groupedHoldings={groupedHoldings}
                        lysaTransactions={lysaTransactions}
                    />}
                />
                <Route path="/holdings" element={
                    <Holdings
                        possibleMatches={possibleMatches}
                        confirmMatch={confirmMatch}
                        resolveMatch={resolveMatch}
                        groupedHoldings={groupedHoldings}
                        portfolioValue={portfolioValue}
                        enrichHoldingSmart={enrichHoldingSmart}
                        enrichmentCandidates={enrichmentCandidates}
                        selectEnrichmentCandidate={selectEnrichmentCandidate}
                        searchEnrichmentCandidates={searchEnrichmentCandidates}
                        deleteHolding={deleteHolding}
                        handleTransaction={handleTransaction}

                    />
                }
                />
                <Route path="/import" element={
                    <ImportPage
                        importHoldings={importHoldings}
                        importLysaTransactions={importLysaTransactions}
                        importLysaPerformance={importLysaPerformance}
                    />
                }
                />
                <Route path="/help" element={
                    <Help />
                }/>
                <Route path="/settings" element={
                    <Settings
                        resetPortfolio={resetPortfolio}
                        setResolvedMatches={setResolvedMatches}
                        enrichMissingAveragePrices={enrichMissingAveragePrices}
                        updateAllHoldingPrices={updateAllHoldingPrices}
                        handleRestoreSnapshot={handleRestoreSnapshot}

                    />
                }/>
                <Route path="/login" element={
                    <Login
                        />
                }/>
            </Routes>
            <InstallPrompt />


        </div>
    );
}

export default App;
