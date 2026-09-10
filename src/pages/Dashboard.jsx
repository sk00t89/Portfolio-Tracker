import AccountList from "../components/AccountList.jsx";
import Allocation from "../components/Allocation.jsx";
import AccountForm from "../components/AccountForm.jsx";
import PortfolioSummary from "../components/PortfolioSummary.jsx";
import {useState, useEffect} from "react";


function Dashboard() {

    const investedCapital = 800000;


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
    const getNextId = (accounts) => {
        const ids = accounts.map((account) => {
            return account.id
        });
        const highestId = Math.max(...ids);

        return highestId < 1 ? 1 : highestId + 1;
    };

    const addAccount = (newAccount) => {
        setAccounts(previousAccount => [
            ...previousAccount,
            {
                id: getNextId(previousAccount),
                ...newAccount
            }
        ]);
    };

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


    return (
        <div className="dashboard-grid">
            <PortfolioSummary
                portfolioValue={portfolioValue}
                investedCapital={investedCapital}
            />

            <AccountList
                accounts={accounts}
                portfolioValue={portfolioValue}
                deleteAccount={deleteAccount}
            />

            <Allocation
                totalsByType={totalsByType}
                portfolioValue={portfolioValue}
            />

            <AccountForm
                addAccount={addAccount}
            />
        </div>
    );
}

export default Dashboard;