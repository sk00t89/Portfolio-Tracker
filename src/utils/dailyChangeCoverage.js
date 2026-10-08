import { quoteFreshnessReason, normalizeQuoteTimestamp, VERIFIED_QUOTE_MAX_AGE } from "./valuationFreshness.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { validDate } from "../../supabase/functions/_shared/referenceData.js";
import { zonedParts, getMarketStatus, latestCompletedSession, LISTING_CALENDARS, normalizeMarketCode } from "../../supabase/functions/_shared/marketCalendar.js";

const positive = n => typeof n === "number" && Number.isFinite(n) && n > 0;
const checked = (p, now) => Number.isFinite(p?.checkedAt) && p.checkedAt <= now && now - p.checkedAt <= VERIFIED_QUOTE_MAX_AGE;
function navValid(p, holding, now) {
    return p?.verified === true && p.kind === "published_nav" && p.isin === holding.isin
        && p.currency === holding.currency && ["Avanza", "Lysa"].includes(p.provider) && p.sourceTimestamp === null
        && validDate(p.sourceDate) && p.sourceDate <= zonedParts(now, "Europe/Stockholm").date && positive(p.price) && checked(p, now);
}
export function dailyHoldingCoverage(holding, now) {
    const reasons = [], fund = isMutualFund(holding) || holding.platform === "Lysa";
    const price = Number(holding.currentPrice), previousClose = Number(holding.previousClose);
    const timestamp = normalizeQuoteTimestamp(holding.priceUpdatedAt);
    const instrumentCovered = !holding.quoteStale && positive(price) && timestamp != null && !quoteFreshnessReason(holding, now);
    let currentPrice = price, previousPrice = previousClose, currentDate, previousDate, navChange = null;
    const navObservation = fund && instrumentCovered ? { date: zonedParts(timestamp, "Europe/Stockholm").date,
        price, currency: holding.currency } : null;
    const market = LISTING_CALENDARS[normalizeMarketCode(holding.market)];
    const status = getMarketStatus(fund ? "STOCKHOLM" : market, now);
    const session = status.status === "open" ? status : latestCompletedSession(fund ? "STOCKHOLM" : market, now);
    if (!instrumentCovered) reasons.push(holding.quoteStale ? "Senaste kurskontrollen misslyckades" : "Instrumentkurs saknas eller är fördröjd");
    if (fund) {
        const nav = holding.dailyReference?.nav;
        if (!navValid(nav?.current, holding, now) || nav.current.price !== price
            || timestamp == null || zonedParts(timestamp, "Europe/Stockholm").date !== nav.current.sourceDate) {
            reasons.push("Verifierat aktuellt NAV-datum saknas eller matchar inte innehavet");
        } else {
            currentDate = nav.current.sourceDate;
            if (!navValid(nav.previous, holding, now) || nav.previous.sourceDate >= currentDate) reasons.push("Föregående publicerade NAV saknas");
            else {
                previousDate = nav.previous.sourceDate; previousPrice = nav.previous.price; currentPrice = nav.current.price;
                navChange = instrumentCovered ? { date: currentDate, previousDate, percent: (currentPrice / previousPrice - 1) * 100,
                    label: "Senast publicerade NAV-förändring" } : null;
            }
            if (currentDate !== session?.date) reasons.push(`Senaste NAV ${currentDate}; NAV för ${session?.date ?? "relevant handelsdag"} saknas`);
            const preceding = session && latestCompletedSession("STOCKHOLM", session.opensAt - 1);
            if (previousDate && previousDate !== preceding?.date) reasons.push("NAV-datumen avser inte portföljens jämförelsedagar");
        }
    } else {
        if (!market || !session) reasons.push(holding.assetType === "CRYPTO" && !holding.isin ? "Direkt krypto saknar verifierad kalenderdagsjämförelse" : "Handelskalender saknas");
        if (!positive(previousClose)) reasons.push("Föregående stängningskurs saknas");
        if (timestamp != null && session) {
            currentDate = zonedParts(timestamp, session.zone).date;
            previousDate = latestCompletedSession(market, session.opensAt - 1)?.date;
            if (holding.previousCloseDate && holding.previousCloseDate !== previousDate) reasons.push("Föregående stängning avser fel handelssession");
            if (currentDate !== session.date || timestamp < session.opensAt || timestamp > session.closesAt + 5 * 60_000) reasons.push("Instrumentkursen avser inte relevant handelssession");
        }
    }
    let currentFx = 1, previousFx = 1;
    const foreign = holding.currency !== "SEK";
    if (foreign) {
        const observations = holding.dailyReference?.fx?.observations ?? [];
        const fx = date => observations.find(p => p.sourceDate === date && p.verified === true && p.from === holding.currency && p.to === "SEK"
            && p.kind === "daily_reference" && p.provider === "Frankfurter" && p.sourceTimestamp === null && positive(p.rate) && checked(p, now));
        const current = fx(currentDate), previous = fx(previousDate);
        if (!current) reasons.push(`Valutans referenskurs för ${currentDate ?? "aktuell jämförelsedag"} saknas`);
        if (!previous) reasons.push(`Valutans föregående referenskurs för ${previousDate ?? "jämförelsedagen"} saknas`);
        currentFx = current?.rate; previousFx = previous?.rate;
    }
    const quantity = Number(holding.quantity);
    if (!positive(quantity)) reasons.push("Verifierat antal för jämförelsen saknas");
    const currentValue = quantity * currentPrice * currentFx, previousValue = quantity * previousPrice * previousFx;
    if (reasons.length === 0 && (!positive(currentValue) || !positive(previousValue))) reasons.push("SEK-jämförelsevärdet är ogiltigt");
    return { id: holding.id, name: holding.name, instrumentCovered, covered: reasons.length === 0,
        reasons, currentDate, previousDate, navChange, navObservation, referenceFx: foreign,
        currentValue: reasons.length ? null : currentValue,
        previousValue: reasons.length ? null : previousValue };
}
