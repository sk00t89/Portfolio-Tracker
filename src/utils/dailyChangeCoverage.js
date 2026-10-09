import { quoteFreshnessReason, normalizeQuoteTimestamp } from "./valuationFreshness.js";
import { isMutualFund } from "../../supabase/functions/_shared/snapshotEngine.js";
import { validDate } from "../../supabase/functions/_shared/referenceData.js";
import { zonedParts, getMarketStatus, latestCompletedSession, LISTING_CALENDARS, normalizeMarketCode } from "../../supabase/functions/_shared/marketCalendar.js";

const positive = n => typeof n === "number" && Number.isFinite(n) && n > 0;
// An immutable dated observation does not expire when its polling/cache interval ends.
// Its identity, observation date and applicable comparison session still must match.
const checked = (p, now) => Number.isFinite(p?.checkedAt) && p.checkedAt > 0 && p.checkedAt <= now
    && validDate(p.sourceDate) && p.sourceDate <= zonedParts(p.checkedAt, "Europe/Stockholm").date;
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
    const freshnessReason = quoteFreshnessReason(holding, now);
    if (!instrumentCovered) reasons.push(holding.quoteStale ? "Senaste kurskontrollen misslyckades"
        : `Instrumentkurs saknas eller är fördröjd: ${freshnessReason ?? "positivt pris eller giltig kurstid saknas"}`);
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
    const today = zonedParts(now, "Europe/Stockholm").date;
    const todayReasons = [...reasons];
    if (fund) todayReasons.push("Fond-NAV visas separat med publicerade värderingsdatum, inte som dagens börsutveckling");
    else if (status.status === "before_open") todayReasons.push(`Börsen har inte öppnat ${status.date}; senaste handelssession ${session?.date ?? "saknas"}`);
    else if (status.status === "closed_day") todayReasons.push(`Börsen är stängd ${status.date}: ${status.reason}`);
    if (!fund && currentDate !== today) todayReasons.push(`Dagens kurstid för ${today} saknas; senaste observation ${currentDate ?? "saknas"}`);
    const reference = holding.dailyReference;
    const source = fund ? reference?.nav?.current?.provider ?? holding.provider ?? "NAV-källa saknas"
        : holding.dailyQuoteCheck?.source ?? "Källa för aktuell kurs saknas";
    const navCheckedAt = reference?.nav?.current?.checkedAt;
    const fxCheckedAt = reference?.fx?.current?.checkedAt;
    const observationChecks = [navCheckedAt, fxCheckedAt].filter(Number.isFinite);
    return { id: holding.id, name: holding.name, instrumentCovered, covered: reasons.length === 0,
        kind: fund ? "nav" : holding.assetType === "CRYPTO" && !holding.isin && holding.productType !== "ETP" ? "crypto" : "listed",
        todayCovered: todayReasons.length === 0, todayReasons,
        diagnostic: { source, quoteTime: timestamp, marketStatus: status.status, expectedDate: session?.date ?? null,
            quoteCheckedAt: holding.dailyQuoteCheck?.checkedAt ?? null,
            referenceCheckedAt: observationChecks.length ? Math.max(...observationChecks) : null,
            lastAttemptAt: reference?.lastAttemptAt ?? null, refreshError: reference?.refreshError ?? null,
            referenceLoading: reference?.loading ?? false,
            referenceValid: !fund && !foreign ? null : (!fund || Boolean(navChange)) && (!foreign || (positive(currentFx) && positive(previousFx))),
            fxSource: foreign ? "Frankfurter · daglig referens" : null,
            closeDateVerified: !fund && Boolean(holding.previousCloseDate) },
        reasons, currentDate, previousDate, navChange, navObservation, referenceFx: foreign,
        currentValue: reasons.length ? null : currentValue,
        previousValue: reasons.length ? null : previousValue };
}
