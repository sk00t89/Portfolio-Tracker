function AccountList({accounts, portfolioValue, deleteAccount}) {

    return (
        <div>
            <h2>Konton</h2>

            {accounts.map((account) => {
                return (
                    <div key={account.id}>
                        <p>
                            {account.name} : {account.value.toLocaleString("sv-SE")} kr
                            - {((account.value / portfolioValue) * 100).toFixed(2)} %
                        </p>

                        <button
                        onClick={(event) => {
                            deleteAccount(account.id);
                        }}
                        >Ta bort</button>
                    </div>
                );
            })}
        </div>
    )
}

export default AccountList;