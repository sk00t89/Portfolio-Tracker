
function AssetList({
                         assets,
                         portfolioValue,
                         totalsByPlatform,
                         deleteAsset
                     }) {

    return (
        <div>
            {assets.map((assets) => {

                const assetsValue =
                    assets.type === "manual"
                        ? assets.value
                        : totalsByPlatform[assets.name] || 0;

                const percentage =
                    portfolioValue > 0
                        ? (assetsValue / portfolioValue) * 100
                        : 0;

                return (
                    <div key={assets.id}>
                        <p>{assets.name}</p>

                        <p>
                            {assetsValue.toLocaleString("sv-SE", {
                                maximumFractionDigits: 0
                            })} kr
                        </p>

                        <p>{percentage.toFixed(2)} %</p>

                        <button onClick={() => deleteAsset(assets.id)}>
                            Ta bort
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export default AssetList;