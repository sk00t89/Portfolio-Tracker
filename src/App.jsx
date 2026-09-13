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


function App() {

// Holdings funktioner


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

    const enrichHolding = (id, data) => {
        setHoldings((prevHoldings) =>
            prevHoldings.map((holding) =>
                holding.id === id
                    ? {
                        ...holding,
                        ticker: data.ticker ?? holding.ticker,
                        isin: data.isin ?? holding.isin,
                        assetType: data.assetType ?? holding.assetType,
                        currency: data.currency ?? holding.currency,
                        market: data.exchange ?? holding.market,
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


    const importHoldings = (newHoldings) => {
        setHoldings((previousHoldings) => {

            let finalHoldings = [...previousHoldings];

            newHoldings.forEach((newHolding) => {
                const newKey = getInstrumentKey(newHolding);

                const existingHolding = finalHoldings.find((oldHolding) => {
                    return (
                        oldHolding.platform === newHolding.platform &&
                        getInstrumentKey(oldHolding) === newKey
                    );
                });

                if (existingHolding) {
                    finalHoldings = finalHoldings.map((holding) => {
                        if (holding.id === existingHolding.id) {
                            return {
                                ...holding,
                                ...newHolding,
                                id: holding.id,
                            };
                        }

                        return holding;
                    });

                } else {
                    finalHoldings.push({
                        ...newHolding,
                        id: getNextId(finalHoldings)
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

    console.log("grupperat", groupHoldingsByInstrument(holdings));

    // Manual Assets funktioner

    const initialAssets = [
        {id: 1, name: "Crypto", source: "manual", category: "crypto", value: 50000},
        {id: 2, name: "Steam inventory", source: "manual", category: "other", value: 20000},
        {id: 3, name: "Sparkonto", source: "manual", category: "cash", value: 200000},

    ];

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
    }

    return (
        <div className="app-shell">
            <button
                type="button"
                onClick={() => {
                    setResolvedMatches([]);
                }}
            > Resetta matches
            </button>
            <Navbar/>
            <Routes>
                <Route path="/" element={
                    <Dashboard
                        assets={assets}
                        setAssets={setAssets}
                        holdings={holdings}
                    />}
                />
                <Route path="/holdings" element={
                    <Holdings
                        holdings={holdings}
                        enrichHolding={enrichHolding}
                        possibleMatches={possibleMatches}
                        confirmMatch={confirmMatch}
                        resolveMatch={resolveMatch}
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
                    />}/>
            </Routes>


        </div>
    );
}

export default App;