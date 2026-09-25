import "./App.css";
import Navbar from "./components/Navbar.jsx";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Holdings from "./pages/Holdings.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import Settings from "./pages/Settings.jsx";
import {useEffect} from "react";
import {useState} from "react";
import getInstrumentKey from "./utils/instrumentKey.js";
import {
    calculatePortfolioValue,
    calculateLysaFundVolumes,
    calculateLysaDeposits,
    getLatestLysaPerformance
} from "./utils/calculations.js";
import {
    getAveragePriceSek,
    getExchangeRate
} from "./services/currencyData.js";
import {findMatchingHolding} from "./utils/holdingMatching.js";
import {
    searchInstrument,
    getYahooPrice,
    getNordnetPriceByIsin,
    getAvanzaPriceByIsin
} from "./services/marketData.js";
import normalizeAssetType from "./utils/normalizeAssetType.js";
import classifyHolding from "./utils/classifyHolding.js";
import getYahooSymbol from "./utils/getYahooSymbol.js";

const PRICE_UPDATE_INTERVAL = 20 * 60 * 1000;

function App() {



// Transaktions funktioner

    const addTransaction = (transaction) => {
        setTransactions((previousTransactions) => [
            ...previousTransactions,
            {
                id: Date.now(),
                ...transaction,
            }
        ]);
    };


// Holdings funktioner


    const updateHoldingPrice = async (id) => {
        const holding = holdings.find(
            (holding) => holding.id === id
        );

        if (!holding) {
            return;
        }

        console.log("Försöker uppdatera:", holding);

        let data = null;

        // 1. Nordnet
        if (holding.isin) {
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

// 2. Avanza
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

        console.log("Aktuell kurs:", data);

        let currentValueSek = null;

        if (data.price && holding.quantity) {
            if (data.currency === "SEK") {
                currentValueSek =
                    holding.quantity * data.price;
            } else if (data.currency) {
                const exchangeRate =
                    await getExchangeRate(
                        data.currency,
                        "SEK"
                    );

                currentValueSek =
                    holding.quantity *
                    data.price *
                    exchangeRate;
            }
        }

        setHoldings((previousHoldings) =>
            previousHoldings.map((item) => {
                if (item.id !== id) {
                    return item;
                }

                return {
                    ...item,
                    currentPrice: data.price,
                    currentValueSek,
                    priceUpdatedAt:
                        data.timestamp ?? Date.now(),
                };
            })
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
            setHoldings((prevHoldings) =>
                prevHoldings.map((item) => {
                    if (item.id !== id) {
                        return item;
                    }

                    const updatedHolding = {
                        ...item,
                        ticker: item.ticker ?? internalMatch.ticker,
                        isin: item.isin ?? internalMatch.isin,
                        assetType: item.assetType ?? internalMatch.assetType,
                        currency: item.currency ?? internalMatch.currency,
                        market: item.market ?? internalMatch.market,
                    };

                    return classifyHolding(updatedHolding);
                })
            );

            return;
        }


        const query =
            holding.ticker ?? holding.name;

        const candidates = await searchInstrument(query);

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

        const candidates = await searchInstrument(query.trim());

        setEnrichmentCandidates((previous) => ({
            ...previous,
            candidates,
        }));
    };


    const enrichMissingAveragePrices = async () => {
        const updatedHoldings = await Promise.all(
            holdings.map(async (holding) => {
                if (
                    holding.averagePriceSek === null &&
                    holding.averagePrice &&
                    holding.currency
                ) {
                    const averagePriceSek =
                        await getAveragePriceSek(holding);

                    console.log(
                        "Berikar GAV:",
                        holding.name,
                        "→",
                        averagePriceSek
                    );

                    return {
                        ...holding,
                        averagePriceSek:
                            averagePriceSek ?? holding.averagePriceSek,
                    };
                }

                console.log(
                    holding.name,
                    holding.averagePrice,
                    holding.currency
                );

                return holding;
            })
        );

        console.log("Holdings efter GAV-berikning:", updatedHoldings);

        setHoldings(updatedHoldings);
    };

    // STATES

    const [enrichmentCandidates, setEnrichmentCandidates] = useState(null);

    const [resolvedMatches, setResolvedMatches] = useState(() => {
        const savedMatches = localStorage.getItem("resolvedMatches");

        return savedMatches
            ? JSON.parse(savedMatches)
            : [];
    });


    const [holdings, setHoldings] = useState(() => {
        const savedHoldings = localStorage.getItem("holdings");

        if (savedHoldings) {
            return JSON.parse(savedHoldings);
        }
        return [];
    });

    const [transactions, setTransactions] = useState(() => {
        const savedTransactions =
            localStorage.getItem("transactions");

        if (savedTransactions) {
            return JSON.parse(savedTransactions);
        }

        return [];
    });

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

    // HOLDINGS FUNKTIONER

    const enrichHolding = async (id, data) => {
        const holding = holdings.find(
            (holding) => holding.id === id
        );

        if (!holding) {
            return;
        }

        const averagePriceSek = await getAveragePriceSek(holding);

        console.log("Berikad holding:", holding.name);
        console.log("GAV SEK:", averagePriceSek);

        setHoldings((prevHoldings) =>
            prevHoldings.map((holding) => {
                if (holding.id !== id) {
                    return holding;
                }

                const updatedHolding = {
                    ...holding,
                    ticker: holding.ticker ?? data.ticker,
                    isin: holding.isin ?? data.isin,
                    assetType:
                        holding.assetType ??
                        normalizeAssetType(data.assetType),
                    currency: holding.currency ?? data.currency,
                    market: holding.market ?? data.exchange,
                    averagePriceSek:
                        averagePriceSek ?? holding.averagePriceSek,
                };

                return classifyHolding(updatedHolding);
            })
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


    const getNextId = (holdings) => {
        const ids = holdings.map((holding) => holding.id);
        const highestId = ids.length > 0 ? Math.max(...ids) : 0;

        return highestId + 1;
    }

    // USE-EFFECTER

    useEffect(() => {
        localStorage.setItem("holdings", JSON.stringify(holdings));
    }, [holdings]);

    useEffect(() => {
        localStorage.setItem(
            "resolvedMatches",
            JSON.stringify(resolvedMatches)
        );
    }, [resolvedMatches]);

    //Tillfällig useEffect
    useEffect(() => {
        console.log("Holdings efter uppdatering:", holdings);

        const missingAveragePriceSek = holdings.filter((holding) => {
            return holding.averagePriceSek == null;
        });

        console.log("Saknar GAV i SEK:", missingAveragePriceSek);
    }, [holdings]);

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

// LYSA ...
    const importLysaTransactions = (transactions) => {
        setLysaTransactions(transactions);
    };

    const importLysaPerformance = (performance) => {
        setLysaPerformance(performance);
    };

    const latestLysaPerformance =
        getLatestLysaPerformance(lysaPerformance);

    const lysaValue =
        latestLysaPerformance?.accountWorth ?? 0;

    const lysaFundVolumes =
        calculateLysaFundVolumes(lysaTransactions);

    const lysaHoldings = Object.entries(lysaFundVolumes)
        .filter(([, volume]) => volume > 0)
        .map(([name, volume]) => ({
            name,
            quantity: volume,
            platform: "Lysa",
            assetType: "FUND",
            category: "FUND",
        }));


 // Holdins ...

    const importHoldings = (newHoldings) => {
        setHoldings((previousHoldings) => {

            let finalHoldings = [...previousHoldings];

            newHoldings.forEach((newHolding) => {
                const normalizedHolding = {
                    ...newHolding,
                    assetType: normalizeAssetType(newHolding.assetType),
                };

                const classifiedHolding =
                    classifyHolding(normalizedHolding);

                const newKey = getInstrumentKey(classifiedHolding);

                const existingHolding = finalHoldings.find((oldHolding) => {
                    return (
                        oldHolding.platform === classifiedHolding.platform &&
                        getInstrumentKey(oldHolding) === newKey
                    );
                });

                if (existingHolding) {
                    finalHoldings = finalHoldings.map((holding) => {
                        if (holding.id === existingHolding.id) {
                            return {
                                ...holding,
                                ...classifiedHolding,
                                id: holding.id,
                            };
                        }

                        return holding;
                    });
                } else {
                    finalHoldings.push({
                        ...classifiedHolding,
                        id: getNextId(finalHoldings),
                    });
                }
            });

            return finalHoldings;
        });
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
                        holding.valueSek,
                    positions: [holding],
                });
            } else {
                existingGroup.totalValue +=
                    holding.currentValueSek ??
                    holding.valueSek;
                existingGroup.positions.push(holding);
            }

            return groups;
        }, []);
    };


    const groupedHoldings = groupHoldingsByInstrument(holdings);

    // Manual Assets funktioner

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
        if (holdings.length === 0) {
            return;
        }

        updateAllHoldingPrices(
            false,
            Date.now()
        );
    }, []);

    useEffect(() => {
        localStorage.setItem(
            "transactions",
            JSON.stringify(transactions)
        );
    }, [transactions]);

    const resetPortfolio = () => {
        setAssets(initialAssets);
        setHoldings([]);
        setResolvedMatches([]);
        setLysaPerformance([]);
        setLysaTransactions([]);
    }
    const portfolioValue = calculatePortfolioValue(
        holdings,
        assets,
        lysaValue
    );





    return (
        <div className="app-shell">

            <Navbar/>
            <Routes>
                <Route path="/" element={
                    <Dashboard
                        assets={assets}
                        setAssets={setAssets}
                        holdings={holdings}
                        portfolioValue={portfolioValue}
                        lysaValue={lysaValue}
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
                        updateHoldingPrice={updateHoldingPrice}
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
                    />}/>
            </Routes>


        </div>
    );
}

export default App;