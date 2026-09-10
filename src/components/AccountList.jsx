function AccountList({accounts, portfolioValue, deleteAccount}) {


    return (
        <div>
            <h2>Konton</h2>

            {accounts.map((account) => {
                return (
                    <div key={account.id} className="card">
                        <p>
                            {account.name} : {account.value.toLocaleString("sv-SE")} kr
                            - {((account.value / portfolioValue) * 100).toFixed(2)} %
                            | {account.type}
                        </p>

                        <button
                            className="danger-button"
                            onClick={() => deleteAccount(account.id)}>
                            Ta bort
                        </button>
                    </div>
                );
            })}
        </div>
    )
}

export default AccountList;