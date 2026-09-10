import "./App.css";
import Navbar from "./components/Navbar.jsx";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Holdings from "./pages/Holdings.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import Settings from "./pages/Settings.jsx";
import {useEffect} from "react";
import {useState} from "react";

function App() {

    const initialAccounts = [
        { id: 1, name: "Avanza", type: "broker", value: 500000 },
        { id: 2, name: "Nordnet", type: "broker", value: 200000 },
        { id: 3, name: "Lysa", type: "fund", value: 200000 },
        { id: 4, name: "Krypto", type: "crypto", value: 100000 },
        { id: 5, name: "Sparkonto", type: "cash", value: 150000 }
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

    const resetAccounts = () => {

        setAccounts(initialAccounts);
    }

    return (
        <div className="app-shell">
            <Navbar/>
            <Routes>
                <Route path="/" element={
                    <Dashboard
                        accounts={accounts}
                        setAccounts={setAccounts}
                    />}
                />
                <Route path="/holdings" element={
                    <Holdings
                        accounts={accounts}/>
                }
                />
                <Route path="/import" element={<ImportPage/>}/>
                <Route path="/settings" element={
                    <Settings
                    resetAccounts={resetAccounts}
                    />}/>
            </Routes>


        </div>
    );
}

export default App;