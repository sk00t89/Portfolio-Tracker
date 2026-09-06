
function AccountList({ accounts, portfolioValue }) {

    return (
        <div>
            <h2>Konton</h2>

            {accounts.map((account) => {
                return (
                    <p key={account.id}>
                        {account.name} : {account.value.toLocaleString("sv-SE")} kr - {((account.value / portfolioValue) * 100).toFixed(2)} %
                    </p>
                );
            })}
        </div>
    )
}
export default AccountList;