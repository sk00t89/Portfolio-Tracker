import { Link } from "react-router-dom";
import AssetList from "../components/AssetList.jsx";
import Allocation from "../components/Allocation.jsx";
import AssetForm from "../components/AssetForm.jsx";
import PortfolioSummary from "../components/PortfolioSummary.jsx";
import { apiFetch } from "../services/apiClient.js";
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
import useDailyReferences from "../hooks/useDailyReferences.js";
import { calculatePortfolioDailyChange } from "../utils/portfolioDailyChange.js";
import { stockholmDate } from "../utils/calendarDate.js";



function Dashboard({
    assets,
    manualAssets,
    userEmail,
    userId,
    holdings,
    portfolioValue,
    lysaValue,
    importHoldings,
    groupedHoldings,
    lysaTransactions,
    portfolioHistory,
    liveValuation,
    historyReady,
    dailyHoldings,
    updatingPrices,
    valuesLoading,
    transactions,
}) {
    const { currency, formatMoney, rate, error } = useDisplayCurrency();
    const marketStatus = useMarketStatus(dailyHoldings);
    // The completed batch may be newer than the market-status timer. Use its real evaluation clock immediately.
    const valuationNow = Math.max(marketStatus.now, liveValuation?.evaluatedAt ?? 0);
    const comparisonHoldings = useDailyReferences(dailyHoldings, userId, apiFetch, !valuesLoading);
    const dailyChange = calculatePortfolioDailyChange({ holdings: comparisonHoldings, manualAssets: assets,
        transactions, lysaTransactions }, valuationNow);
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
            {error ? <p className="history-readiness" role="alert">Visningsvalutan kunde inte laddas. <Link to="/settings">Välj SEK i Inställningar.</Link></p> : rate == null && <p className="history-readiness" role="status">Hämtar visningsvaluta…</p>}
            <PortfolioSummary
                formatMoney={formatMoney}
                portfolioValue={portfolioValue}
                investedCapital={investedCapital}
                dailyChange={dailyChange}
                updatingPrices={updatingPrices}
                valuesLoading={valuesLoading}
                history={portfolioHistory}
                currency={currency}
                today={stockholmDate(valuationNow)}
                now={valuationNow}
                liveValuation={liveValuation}
            >{!valuesLoading && <>
                <DailyMovers holdings={dailyHoldings} formatMoney={formatMoney} currency={currency} now={marketStatus.now} />
                <HoldingsOverview formatMoney={formatMoney} groupedHoldings={groupedHoldings} />
            </>}</PortfolioSummary>

            {historyReady && portfolioHistory.freshnessReason && <p className="history-readiness" role="status">Historik pausad · se marknad och historikstatus.</p>}
            <details className="card dashboard-market-details">
                <summary>Marknad och historikstatus</summary>
            <MarketStatus markets={marketStatus.markets} />
            {!historyReady && <p className="history-readiness" role="status">Historik sparas när portföljens värden är färdigladdade och kompletta.</p>}
            {historyReady && portfolioHistory.freshnessReason && <p className="history-readiness" role="status">Historik pausad: {portfolioHistory.freshnessReason} Uppdatera kurserna under Inställningar.</p>}
            </details>
            {!valuesLoading && <>

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
