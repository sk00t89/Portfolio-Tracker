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
import DailyMovers from "../components/DailyMovers.jsx";
import useDisplayCurrency from "../hooks/useDisplayCurrency.js";
import ManualAssetsStatus from "../components/ManualAssetsStatus.jsx";
import MarketStatus from "../components/MarketStatus.jsx";
import useMarketStatus from "../hooks/useMarketStatus.js";
import { calculatePortfolioDailyChange } from "../utils/portfolioDailyChange.js";
import { stockholmDate } from "../utils/calendarDate.js";



function Dashboard({
    assets,
    manualAssets,
    userEmail,
    holdings,
    portfolioValue,
    lysaValue,
    importHoldings,
    groupedHoldings,
    lysaTransactions,
    portfolioHistory,
    historyReady,
    dailyHoldings,
    updatingPrices,
    valuesLoading,
    transactions,
}) {
    const { currency, setCurrency, formatMoney, rate, error } = useDisplayCurrency();
    const marketStatus = useMarketStatus(dailyHoldings);
    const dailyChange = calculatePortfolioDailyChange({ holdings: dailyHoldings, manualAssets: assets,
        transactions, lysaTransactions }, marketStatus.now);
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



    return (
        <div className="dashboard-grid">
            <ManualAssetsStatus state={manualAssets} email={userEmail} />
            <div className="dashboard-currency-bar">
                <label htmlFor="dashboard-currency">Visningsvaluta</label>
                <select id="dashboard-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                    <option value="SEK">SEK</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
                {error ? <span role="alert">Valutakursen kunde inte hämtas. Välj SEK eller försök igen.</span> :
                    rate == null && <span role="status">Hämtar valutakurs…</span>}
            </div>
            <PortfolioSummary
                formatMoney={formatMoney}
                portfolioValue={portfolioValue}
                investedCapital={investedCapital}
                dailyChange={dailyChange}
                updatingPrices={updatingPrices}
                valuesLoading={valuesLoading}
                history={portfolioHistory}
                currency={currency}
                today={stockholmDate(marketStatus.now)}
                now={marketStatus.now}
            />

            <MarketStatus markets={marketStatus.markets} />
            {!historyReady && <p className="history-readiness" role="status">Historik sparas när portföljens värden är färdigladdade och kompletta.</p>}
            {historyReady && portfolioHistory.freshnessReason && <p className="history-readiness" role="status">Historik pausad: {portfolioHistory.freshnessReason} Uppdatera kurserna under Inställningar.</p>}
            {!valuesLoading && <>
            <DailyMovers holdings={dailyHoldings} formatMoney={formatMoney} currency={currency} now={marketStatus.now} />

            <AssetList
                formatMoney={formatMoney}
                assets={assets}
                portfolioValue={portfolioValue}
                deleteAsset={manualAssets.deleteAsset}
                totalsByPlatform={totalsByPlatform}
            />

            <Allocation
                formatMoney={formatMoney}
                totalsByType={totalsByPlatform}
                portfolioValue={portfolioValue}
                totalsByCategory={totalsByCategory}
            />
            {Object.keys(cryptoExposure.summary).length > 0 && (
                <CryptoOverview
                    formatMoney={formatMoney}
                    cryptoExposure={cryptoExposure}
                    portfolioValue={portfolioValue}
                />
            )}
            <HoldingsOverview
                formatMoney={formatMoney}
                groupedHoldings={groupedHoldings}
            />

            <AssetForm
                addAsset={manualAssets.addAsset}
                manualAssetsDisabled={!manualAssets.ready || manualAssets.busy}
                importHoldings={importHoldings}
            />
            <AddHoldingForm
                importHoldings={importHoldings}
            />
            </>}
        </div>
    );
}

export default Dashboard;
