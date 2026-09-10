import AccountList from "../components/AccountList.jsx";
import Allocation from "../components/Allocation.jsx";
import AccountForm from "../components/AccountForm.jsx";
import PortfolioSummary from "../components/PortfolioSummary.jsx";



function Dashboard({ accounts, setAccounts }) {

    const investedCapital = 800000;



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