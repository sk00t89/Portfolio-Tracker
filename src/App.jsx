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

    const [holdings, setHoldings] = useState(() => {
        const savedHoldings = localStorage.getItem("holdings");

        if (savedHoldings) {
            return JSON.parse(savedHoldings);
        }
        return [];
    });

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

    const initialAccounts = [
        {id: 1, name: "Avanza", type: "broker", value: 500000},
        {id: 2, name: "Nordnet", type: "broker", value: 200000},
        {id: 3, name: "Lysa", type: "fund", value: 200000},
        {id: 4, name: "Krypto", type: "crypto", value: 100000},
        {id: 5, name: "Sparkonto", type: "cash", value: 150000}
    ];

    const [accounts, setAccounts] = useState(() => {
        const savedAccounts = localStorage.getItem("accounts");

        if (savedAccounts) {
            return JSON.parse(savedAccounts);
        }

        return initialAccounts;
    });

    useEffect(() => {
        localStorage.setItem("accounts", JSON.stringify(accounts));
    }, [accounts]);

    const resetPortfolio = () => {

        setAccounts(initialAccounts);
        setHoldings([]);
    }

    return (
        <div className="app-shell">
            <Navbar/>
            <Routes>
                <Route path="/" element={
                    <Dashboard
                        accounts={accounts}
                        setAccounts={setAccounts}
                        holdings={holdings}
                    />}
                />
                <Route path="/holdings" element={
                    <Holdings
                        accounts={accounts}
                        holdings={holdings}
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