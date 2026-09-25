
function AssetList({
                         assets,
                         portfolioValue,
                         totalsByPlatform,
                         deleteAsset
                     }) {

    return (
        <div>
            {assets.map((asset) => {

                const assetValue =
                    asset.source === "manual"
                        ? asset.value
                        : totalsByPlatform[asset.name] || 0;

                const percentage =
                    portfolioValue > 0
                        ? (assetValue / portfolioValue) * 100
                        : 0;

                return (
                    <div key={asset.id}>
                        <p>{asset.name}</p>

                        <p>
                            {assetValue.toLocaleString("sv-SE", {
                                maximumFractionDigits: 0
                            })} kr
                        </p>

                        <p>{percentage.toFixed(2)} %</p>

                        <button onClick={() => deleteAsset(asset.id)}>
                            Ta bort
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export default AssetList;