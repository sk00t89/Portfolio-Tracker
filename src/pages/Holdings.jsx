function Holdings({accounts}) {

    const holdings = [
        {
            id: 1,
            accountId: 1,
            name: "Palantir",
            assetType: "stock",
            value: 45000
        },
        {
            id: 2,
            accountId: 1,
            name: "Investor",
            assetType: "stock",
            value: 80000
        },
        {
            id: 3,
            accountId: 2,
            name: "Virtune Ethereum",
            assetType: "certificate",
            underlying: "ETH",
            value: 30000
        }
    ];

    return (
        <div>
            {holdings.map((holding) => {
                const account = accounts.find((account) => {
                    return account.id === holding.accountId;
                });
                return (
                    <div key={holding.id}>
                        <p>
                            {holding.name} - {holding.value.toLocaleString("sv-SE")} kr - {account?.name}
                        </p>
                    </div>
                );
            })}
        </div>
    )
}

export default Holdings;