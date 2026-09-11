import AccountList from "../components/AccountList.jsx";
import Allocation from "../components/Allocation.jsx";
import AccountForm from "../components/AccountForm.jsx";
import PortfolioSummary from "../components/PortfolioSummary.jsx";
import { calculatePortfolioValue,
calculateTotalsByPlatform
} from "../utils/calculations.js";


function Dashboard({accounts, setAccounts, holdings}) {

    const investedCapital = 800000;

    const portfolioValue = calculatePortfolioValue(holdings, accounts);

    const totalsByPlatform = calculateTotalsByPlatform(holdings);

    const getNextId = (accounts) => {
        const ids = accounts.map((account) => {
            return account.id;
        });

        const highestId = Math.max(...ids);

        return highestId < 1 ? 1 : highestId + 1;
    };

    const addAccount = (newAccount) => {
        setAccounts((previousAccounts) => [
            ...previousAccounts,
            {
                id: getNextId(previousAccounts),
                ...newAccount
            }
        ]);
    };

    const deleteAccount = (id) => {
        setAccounts((previousAccounts) => {
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
                totalsByPlatform={totalsByPlatform}
            />

            <Allocation
                totalsByType={totalsByPlatform}
                portfolioValue={portfolioValue}
            />

            <AccountForm
                addAccount={addAccount}
            />
        </div>
    );
}

export default Dashboard;