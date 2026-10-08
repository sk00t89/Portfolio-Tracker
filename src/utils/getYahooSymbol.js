import { normalizeYahooSymbol } from "../../supabase/functions/_shared/yahooSymbol.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";

const getYahooSymbol = (holding) => !holding || isMutualFund(holding) ? null
    : normalizeYahooSymbol(holding.ticker, holding.market);

export default getYahooSymbol;
