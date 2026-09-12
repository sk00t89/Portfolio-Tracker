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

    const getNextId = (holdings) => {
        const ids = holdings.map((holding) => holding.id);
        const highestId = ids.length > 0 ? Math.max(...ids) : 0;

        return highestId + 1;
    }

    useEffect(() => {
        localStorage.setItem("holdings", JSON.stringify(holdings));
    }, [holdings]);

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