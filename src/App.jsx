import "./App.css";
import Navbar from "./components/Navbar.jsx";
import InstallPrompt from "./components/InstallPrompt.jsx";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Holdings from "./pages/Holdings.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import Settings from "./pages/Settings.jsx";
import {useEffect, useState} from "react";
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
    getAvanzaPriceByInstrumentId
} from "./services/marketData.js";
import normalizeAssetType from "./utils/normalizeAssetType.js";
import classifyHolding from "./utils/classifyHolding.js";
import getYahooSymbol from "./utils/getYahooSymbol.js";
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
} from "./services/database.js";

const PRICE_UPDATE_INTERVAL = 20 * 60 * 1000;



function App() {


    // =========================================
    // supabase
    // =========================================
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [theme, setTheme] = useState("dark");

    useEffect(() => {
        const savedTheme =
            localStorage.getItem("theme");

        const systemPrefersLight =
            window.matchMedia?.(
                "(prefers-color-scheme: light)"
            ).matches;

        const initialTheme =
            savedTheme ??
            (systemPrefersLight ? "light" : "dark");

        setTheme(initialTheme);
        document.documentElement.dataset.theme =
            initialTheme;
    }, []);

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
            } else {
                setHoldingsLoading(true);
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
    const updateHoldingPrice = async (id) => {
        const holding = holdings.find(
            (holding) => holding.id === id
        );

        if (!holding) {
            return;
        }

        let data = null;

        // 1. Nordnet via instrumentId
        if (
            holding.provider === "Nordnet" &&
            holding.instrumentId
        ) {
            try {
                data = await getNordnetPriceByInstrumentId(
                    holding.instrumentId
                );
                console.log("Nordnet uppdaterade:", holding.name, "via instrumentId")

                if (!data?.price) {
                    data = null;
                }
            } catch (error) {
                console.log(
                    "Nordnet via instrumentId misslyckades:",
                    holding.name,
                    error
                );
            }
        }

        // 2. Avanza via instrumentId
        if (
            !data &&
            holding.provider === "Avanza" &&
            holding.instrumentId
        ) {
            try {
                data = await getAvanzaPriceByInstrumentId(
                    holding.instrumentId
                );
                console.log("Avanza uppdaterade:", holding.name, "via instrumentId")
                if (!data?.price) {
                    data = null;
                }
            } catch (error) {
                console.log(
                    "Avanza via instrumentId misslyckades:",
                    holding.name,
                    error
                );
            }
        }

        // 3. Avanza via ISIN
        // De flesta Nordnet-innehav finns även hos Avanza.
        if (!data && holding.isin) {
            try {
                data = await getAvanzaPriceByIsin(
                    holding.isin
                );

                if (!data?.price) {
                    data = null;
                }
            } catch (error) {
                console.log(
                    "Avanza hittade inget pris:",
                    holding.name,
                    "error:",
                    error
                );
            }
        }

        // 4. Nordnet via ISIN
        // Fallback för t.ex. Nordnets egna fonder/instrument.
        if (!data && holding.isin) {
            try {
                data = await getNordnetPriceByIsin(
                    holding.isin
                );

                if (!data?.price) {
                    data = null;
                }
            } catch (error) {
                console.log(
                    "Nordnet hittade inget pris:",
                    holding.name,
                    "error:",
                    error
                );
            }
        }

        // 3. Yahoo

        if (!data) {
            const yahooSymbol = getYahooSymbol(holding);

            if (!yahooSymbol) {
                console.log(
                    "Ingen priskälla hittades för:",
                    holding.name
                );

                return;
            }

            data = await getYahooPrice(
                yahooSymbol
            );
        }

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
            currentValueSek,
            priceUpdatedAt:
                data.timestamp ??
                // eslint-disable-next-line react-hooks/purity
                Date.now(),
        };

        const {
            data: savedHolding,
            error: saveError,
        } = await updateDatabaseHolding(
            id,
            updatedHolding
        );

        if (saveError) {
            console.error(
                "Kunde inte spara uppdaterad kurs i Supabase:",
                holding.name,
                saveError
            );
            return;
        }

        setHoldings((previousHoldings) =>
            previousHoldings.map((item) =>
                item.id === id
                    ? savedHolding
                    : item
            )
        );
    };


    const updateAllHoldingPrices = async (
        forceUpdate = false,
        now
    ) => {
        const lastUpdate = Number(
            localStorage.getItem("lastPriceUpdate")
        ) || 0;

        const pricesAreFresh =
            now - lastUpdate < PRICE_UPDATE_INTERVAL;

        if (pricesAreFresh && !forceUpdate) {
            console.log("Kurserna är fortfarande färska");
            return;
        }

        for (const holding of holdings) {
            await updateHoldingPrice(holding.id);
        }

        if (forceUpdate) {
            try {
                const lysaPrices =
                    await getLysaFundPrices();

                setLysaFundPrices(lysaPrices);
            } catch (error) {
                console.error(
                    "Lysa-kurserna kunde inte uppdateras:",
                    error
                );
            }
        }

        localStorage.setItem(
            "lastPriceUpdate",
            String(now)
        );
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

    const handleRestoreSnapshot = (snapshot) => {
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

        setHoldings(restoredData.holdings);
        setAssets(restoredData.assets);
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


    const [holdings, setHoldings] = useState([]);
    const [holdingsLoading, setHoldingsLoading] = useState(true);

    useEffect(() => {
        if (!session) {
            return;
        }

        const loadHoldings = async () => {
            setHoldingsLoading(true);

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

            setHoldings(repairedHoldings);
            setHoldingsLoading(false);
        };

        void loadHoldings();
    }, [session]);


    const [lysaTransactions, setLysaTransactions] = useState(() => {
        const saved =
            localStorage.getItem("lysaTransactions");

        return saved
            ? JSON.parse(saved)
            : [];
    });

    const [lysaPerformance, setLysaPerformance] = useState(() => {
        const saved =
            localStorage.getItem("lysaPerformance");

        return saved
            ? JSON.parse(saved)
            : [];
    });

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
            "lysaTransactions",
            JSON.stringify(lysaTransactions)
        );
    }, [lysaTransactions]);

    useEffect(() => {
        localStorage.setItem(
            "lysaPerformance",
            JSON.stringify(lysaPerformance)
        );
    }, [lysaPerformance]);

    useEffect(() => {
        localStorage.setItem(
            "transactions",
            JSON.stringify(transactions)
        );
    }, [transactions]);



    // =========================================
    // LYSA: importerad historik och visningsdata
    // =========================================

    const importLysaTransactions = (transactions) => {
        setLysaTransactions(transactions);
    };

    const importLysaPerformance = (performance) => {
        setLysaPerformance(performance);
    };

    useEffect(() => {
        const loadLysaFundPrices = async () => {
            try {
                const prices =
                    await getLysaFundPrices();

                setLysaFundPrices(prices);

            } catch (error) {
                console.error(
                    "Kunde inte uppdatera Lysa:",
                    error
                );
            }
        };

       void loadLysaFundPrices();
    }, []);

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
                currentValueSek:
                    currentPrice
                        ? volume * currentPrice
                        : null,
                priceUpdatedAt:
                    priceData?.date ?? null,
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

    const initialAssets = [];

    const [assets, setAssets] = useState(() => {
        const savedAssets = localStorage.getItem("assets");

        if (savedAssets) {
            return JSON.parse(savedAssets);
        }

        return initialAssets;
    });

    useEffect(() => {
        localStorage.setItem("assets", JSON.stringify(assets));
    }, [assets]);

    useEffect(() => {
        if (holdingsLoading || holdings.length === 0) {
            return;
        }

        void updateAllHoldingPrices(
            false,
            // eslint-disable-next-line react-hooks/purity
            Date.now()
        );

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
        const { error } = await deleteAllHoldings();

        if (error) {
            console.error(
                "Kunde inte återställa holdings i Supabase:",
                error
            );
            return;
        }

        setAssets(initialAssets);
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
            // eslint-disable-next-line react-hooks/purity
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

    if (authLoading || (session && holdingsLoading)) {
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
            <InstallPrompt />
            <Routes>
                <Route path="/" element={
                    <Dashboard
                        assets={assets}
                        setAssets={setAssets}
                        holdings={holdings}
                        portfolioValue={portfolioValue}
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


        </div>
    );
}

export default App;