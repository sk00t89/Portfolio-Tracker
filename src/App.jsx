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
import {calculatePortfolioValue} from "./utils/calculations.js";
import {getAveragePriceSek} from "./services/currencyData.js";
import {findMatchingHolding} from "./utils/holdingMatching.js";
import {searchInstrument} from "./services/marketData.js";
import normalizeAssetType from "./utils/normalizeAssetType.js";
import classifyHolding from "./utils/classifyHolding.js";

function App() {

// Holdings funktioner


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
                prevHoldings.map((item) =>
                    item.id === id
                        ? {
                            ...item,
                            ticker: item.ticker ?? internalMatch.ticker,
                            isin: item.isin ?? internalMatch.isin,
                            assetType: item.assetType ?? internalMatch.assetType,
                            currency: item.currency ?? internalMatch.currency,
                            market: item.market ?? internalMatch.market,
                        }
                        : item
                )
            );

            return;
        }

        const query = holding.ticker ?? holding.name;

        const candidates = await searchInstrument(query);

        const data = candidates.find(
            (candidate) =>
                candidate.currency === holding.currency
        );

        if (!data) {
            console.log(
                "Kunde inte hitta säker match för:",
                holding.name
            );
            return;
        }

        await enrichHolding(id, data);
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
            prevHoldings.map((holding) =>
                holding.id === id
                    ? {
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
                    }
                    : holding
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
                if (holding.id === targetHolding.id) {
                    return {
                        ...holding,
                        isin: sourceHolding.isin ?? holding.isin,
                        ticker: sourceHolding.ticker ?? holding.ticker,
                        country: sourceHolding.country ?? holding.country,
                        market: sourceHolding.market ?? holding.market,
                        assetType: sourceHolding.assetType ?? holding.assetType,
                    };
                }

                return holding;
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
    }, [holdings]);


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
                    totalValue: holding.valueSek,
                    positions: [holding],
                });
            } else {
                existingGroup.totalValue += holding.valueSek;
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

    const resetPortfolio = () => {
        setAssets(initialAssets);
        setHoldings([]);
        setResolvedMatches([]);
    }
    const portfolioValue = calculatePortfolioValue(holdings, assets);

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
                    />}
                />
                <Route path="/holdings" element={
                    <Holdings
                        holdings={holdings}
                        enrichHolding={enrichHolding}
                        possibleMatches={possibleMatches}
                        confirmMatch={confirmMatch}
                        resolveMatch={resolveMatch}
                        groupedHoldings={groupedHoldings}
                        portfolioValue={portfolioValue}
                        enrichHoldingSmart={enrichHoldingSmart}
                    />
                }
                />
                <Route path="/import" element={
                    <ImportPage
                        importHoldings={importHoldings}
                    />
                }
                />
                <Route path="/settings" element={
                    <Settings
                        resetPortfolio={resetPortfolio}
                        setResolvedMatches={setResolvedMatches}
                        enrichMissingAveragePrices={enrichMissingAveragePrices}
                    />}/>
            </Routes>


        </div>
    );
}

export default App;