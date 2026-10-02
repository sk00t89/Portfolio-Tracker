import AssetList from "../components/AssetList.jsx";
import Allocation from "../components/Allocation.jsx";
import AssetForm from "../components/AssetForm.jsx";
import PortfolioSummary from "../components/PortfolioSummary.jsx";
import CryptoOverview from "../components/CryptoOverview.jsx";
import {
    calculateInvestedCapital,
    calculateTotalsByPlatform,
    calculateTotalsByCategory,
    calculateCryptoExposure,
    calculateLysaDeposits
} from "../utils/calculations.js";
import AddHoldingForm from "../components/AddHoldingForm.jsx";
import HoldingsOverview from "../components/HoldingsOverview.jsx";



function Dashboard({
    assets,
    setAssets,
    holdings,
    portfolioValue,
    lysaValue,
    importHoldings,
    groupedHoldings,
    lysaTransactions,
}) {
    const lysaInvestedCapital =
        calculateLysaDeposits(lysaTransactions);

    const manualAssetCapital = assets.reduce(
        (total, asset) =>
            total + Number(asset.value ?? 0),
        0
    );

    const investedCapital =
        calculateInvestedCapital(holdings) +
        lysaInvestedCapital +
        manualAssetCapital;

    const cryptoExposure = calculateCryptoExposure(holdings);

    const totalsByPlatform =
        calculateTotalsByPlatform(
            holdings,
            lysaValue
        );

    const totalsByCategory = calculateTotalsByCategory(
        holdings,
        assets,
        lysaValue
    );

    const getNextId = (assets) => {
        const ids = assets.map((asset) => {
            return asset.id;
        });

        const highestId = Math.max(...ids);

        return highestId < 1 ? 1 : highestId + 1;
    };

    const addAsset = (newAsset) => {
        setAssets((previousAssets) => [
            ...previousAssets,
            {
                id: getNextId(previousAssets),
                ...newAsset
            }
        ]);
    };

    const deleteAsset = (id) => {
        setAssets((previousAssets) => {
            return previousAssets.filter((asset) => {
                return asset.id !== id;
            });
        });
    };


    return (
        <div className="dashboard-grid">
            <PortfolioSummary
                portfolioValue={portfolioValue}
                investedCapital={investedCapital}
            />

            <AssetList
                assets={assets}
                portfolioValue={portfolioValue}
                deleteAsset={deleteAsset}
                totalsByPlatform={totalsByPlatform}
            />

            <Allocation
                totalsByType={totalsByPlatform}
                portfolioValue={portfolioValue}
                totalsByCategory={totalsByCategory}
            />
            {Object.keys(cryptoExposure.summary).length > 0 && (
                <CryptoOverview
                    cryptoExposure={cryptoExposure}
                    portfolioValue={portfolioValue}
                />
            )}
            <HoldingsOverview
                groupedHoldings={groupedHoldings}
            />

            <AssetForm
                addAsset={addAsset}
                importHoldings={importHoldings}
            />
            <AddHoldingForm
                importHoldings={importHoldings}
            />
        </div>
    );
}

export default Dashboard;