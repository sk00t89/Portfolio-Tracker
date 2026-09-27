import {formatSek} from "../utils/formatting.js";

function AssetList({
    assets,
    portfolioValue,
    totalsByPlatform,
    deleteAsset
}) {
    const platformRows = Object.entries(totalsByPlatform)
        .sort(([, valueA], [, valueB]) => valueB - valueA);

    return (
        <section className="card">
            <div className="section-heading">
                <div>
                    <span className="eyebrow">Fördelning</span>
                    <h2>Plattformar</h2>
                </div>
            </div>

            <div className="data-list">
                {platformRows.map(([platform, value]) => {
                    const percentage =
                        portfolioValue > 0
                            ? (value / portfolioValue) * 100
                            : 0;

                    return (
                        <div className="data-row" key={platform}>
                            <span>{platform}</span>
                            <strong>{formatSek(value)}</strong>
                            <span className="muted">
                                {percentage.toFixed(2)} %
                            </span>
                        </div>
                    );
                })}
            </div>

            {assets.length > 0 && (
                <>
                    <div className="subsection-title">
                        Manuella tillgångar
                    </div>

                    <div className="data-list">
                        {assets.map((asset) => {
                            const percentage =
                                portfolioValue > 0
                                    ? (asset.value / portfolioValue) * 100
                                    : 0;

                            return (
                                <div className="data-row asset-row" key={asset.id}>
                                    <span>{asset.name}</span>
                                    <strong>{formatSek(asset.value)}</strong>
                                    <span className="muted">
                                        {percentage.toFixed(2)} %
                                    </span>

                                    <button
                                        className="ghost-button danger-text"
                                        type="button"
                                        onClick={() => deleteAsset(asset.id)}
                                    >
                                        Ta bort
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}

export default AssetList;
