
function AccountList({
                         accounts,
                         portfolioValue,
                         totalsByPlatform,
                         deleteAccount
                     }) {

    return (
        <div>
            {accounts.map((account) => {

                const accountValue =
                    account.type === "manual"
                        ? account.value
                        : totalsByPlatform[account.name] || 0;

                const percentage =
                    portfolioValue > 0
                        ? (accountValue / portfolioValue) * 100
                        : 0;

                return (
                    <div key={account.id}>
                        <p>{account.name}</p>

                        <p>
                            {accountValue.toLocaleString("sv-SE", {
                                maximumFractionDigits: 0
                            })} kr
                        </p>

                        <p>{percentage.toFixed(2)} %</p>

                        <button onClick={() => deleteAccount(account.id)}>
                            Ta bort
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export default AccountList;