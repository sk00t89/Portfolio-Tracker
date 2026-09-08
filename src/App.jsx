import AccountList from './components/AccountList.jsx';
import Allocation from "./components/Allocation.jsx";
import {useEffect, useState} from 'react';
import AccountForm from "./components/AccountForm.jsx";

function App() {
    const [showAllocation, setShowAllocation] = useState(true);

    const [accounts, setAccounts] = useState(() => {

        const savedAccounts = localStorage.getItem("accounts");

        if (savedAccounts) {
            return JSON.parse(savedAccounts)
        }

        return [
            {
                id: 1,
                name: "Avanza",
                type: "broker",
                value: 500000,

            },
            {
                id: 2,
                name: "Nordnet",
                type: "broker",
                value: 200000,

            },
            {
                id: 3,
                name: "Lysa",
                type: "fund",
                value: 200000,

            },
            {
                id: 4,
                name: "Krypto",
                type: "crypto",
                value: 100000,

            },
            {
                id: 5,
                name: "Sparkonto",
                type: "cash",
                value: 150000,

            }
        ];
    });

    useEffect(() => {
        localStorage.setItem("accounts", JSON.stringify(accounts));
    }, [accounts]);

    const portfolioValue = accounts.reduce((total, account) => {
        return total + account.value;
    }, 0);

    const totalsByType = accounts.reduce((total, account) => {
        total[account.type] = (total[account.type] || 0) + account.value;
        return total;
    }, {});

    const deleteAccount = (id) => {
        setAccounts(previousAccounts => {
            return previousAccounts.filter((account) => {
                return account.id !== id;
            });
        });
    };

    const getNextId = (accounts) => {
        const ids = accounts.map((account) => {
            return account.id
        });
        const highestId = Math.max(...ids);

        return highestId < 1 ? 1 : highestId + 1;
    };


    const investedCapital = 800000;




    return (
        <div>
            <h1>Portfolio Tracker</h1>

            <h2>Totalt portföljvärde</h2>
            <p>{portfolioValue.toLocaleString("sv-SE")} kr</p>
            <p>Insatt kapital {investedCapital.toLocaleString("sv-SE")} kr</p>

            <h2>Fördelning</h2>
            <AccountList
                accounts={accounts}
                portfolioValue={portfolioValue}
                deleteAccount={deleteAccount}
            />


            <AccountForm
                getNextId={getNextId}
                setAccounts={setAccounts}
            />


            <h2>Kapitalförändring</h2>
            <p>+ {((portfolioValue / investedCapital - 1) * 100).toFixed(2)} %</p>
            <p>+ {(portfolioValue - investedCapital).toLocaleString("sv-SE")} kr</p>

            <h2>Allokering per kategori</h2>
            {showAllocation ? <Allocation
                totalsByType={totalsByType}
                portfolioValue={portfolioValue}
            /> : null}


            <button onClick={() => {
                setShowAllocation(previous => !previous);

            }}>
                {showAllocation ? "Dölj allokering" : "Visa allokering"}
            </button>

        </div>
    );
}

export default App;