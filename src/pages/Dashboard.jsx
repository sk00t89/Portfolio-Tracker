import AssetList from "../components/AssetList.jsx";
import Allocation from "../components/Allocation.jsx";
import AssetForm from "../components/AssetForm.jsx";
import PortfolioSummary from "../components/PortfolioSummary.jsx";
import CryptoOverview from "../components/CryptoOverview.jsx";
import {
    calculateInvestedCapital,
    calculateTotalsByPlatform,
    calculateTotalsByCategory,
    calculateCryptoExposure
} from "../utils/calculations.js";


function Dashboard({assets, setAssets, holdings, portfolioValue}) {



    const investedCapital = calculateInvestedCapital(holdings);

    const cryptoExposure = calculateCryptoExposure(holdings);

    console.log(calculateCryptoExposure(holdings));

    const totalsByPlatform = calculateTotalsByPlatform(holdings);

    const totalsByCategory = calculateTotalsByCategory(holdings, assets);

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
            {Object.keys(cryptoExposure).length > 0 && (
                <CryptoOverview
                    cryptoExposure={cryptoExposure}
                    portfolioValue={portfolioValue}
                />
            )}

            <AssetForm
                addAsset={addAsset}
            />
        </div>
    );
}

export default Dashboard;