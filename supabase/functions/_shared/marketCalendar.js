// Reviewed official regular-equity calendars. Unknown years/venues fail closed.
// https://www.nasdaq.com/european-market-activity/trading-hours
// https://www.nyse.com/trade/hours-calendars
export const CALENDAR_YEARS = [2026, 2027];
const calendars = {
    STOCKHOLM: {
        zone: "Europe/Stockholm", label: "Stockholm", open: "09:00", close: "17:30",
        holidays: {
            "2026-01-01": "nyårsdagen", "2026-01-06": "trettondedag jul", "2026-04-03": "långfredagen",
            "2026-04-06": "annandag påsk", "2026-05-01": "första maj", "2026-05-14": "Kristi himmelsfärdsdag",
            "2026-06-19": "midsommarafton", "2026-12-24": "julafton", "2026-12-25": "juldagen", "2026-12-31": "nyårsafton",
            "2027-01-01": "nyårsdagen", "2027-01-06": "trettondedag jul", "2027-03-26": "långfredagen",
            "2027-03-29": "annandag påsk", "2027-05-06": "Kristi himmelsfärdsdag", "2027-06-25": "midsommarafton",
            "2027-12-24": "julafton", "2027-12-31": "nyårsafton",
        },
        halfDays: ["2026-01-05", "2026-04-02", "2026-04-30", "2026-05-13", "2026-10-30",
            "2027-01-05", "2027-03-25", "2027-04-30", "2027-05-05", "2027-11-05"], halfClose: "13:00",
    },
    USA: {
        zone: "America/New_York", label: "USA", open: "09:30", close: "16:00",
        holidays: {
            "2026-01-01": "nyårsdagen", "2026-01-19": "Martin Luther King Jr. Day", "2026-02-16": "Presidents’ Day",
            "2026-04-03": "långfredagen", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth",
            "2026-07-03": "Independence Day (observerad)", "2026-09-07": "Labor Day", "2026-11-26": "Thanksgiving",
            "2026-12-25": "juldagen", "2027-01-01": "nyårsdagen", "2027-01-18": "Martin Luther King Jr. Day",
            "2027-02-15": "Presidents’ Day", "2027-03-26": "långfredagen", "2027-05-31": "Memorial Day",
            "2027-06-18": "Juneteenth (observerad)", "2027-07-05": "Independence Day (observerad)",
            "2027-09-06": "Labor Day", "2027-11-25": "Thanksgiving", "2027-12-24": "juldagen (observerad)",
        },
        halfDays: ["2026-11-27", "2026-12-24", "2027-11-26"], halfClose: "13:00",
    },
};

export function zonedParts(value, zone = "Europe/Stockholm") {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", { timeZone: zone,
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, ...parts };
}
export function addCalendarDays(date, days) {
    const time = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000;
    return new Date(time).toISOString().slice(0, 10);
}
export function zonedInstant(date, time, zone) {
    const wanted = Date.parse(`${date}T${time}:00Z`);
    let instant = wanted;
    for (let i = 0; i < 3; i++) {
        const parts = zonedParts(instant, zone);
        const represented = Date.parse(`${parts.date}T${parts.time}:00Z`);
        instant += wanted - represented;
    }
    return instant;
}
export function tradingSession(market, date) {
    const config = calendars[market];
    if (!config || !CALENDAR_YEARS.includes(Number(date.slice(0, 4)))) return { known: false, date, market };
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const reason = config.holidays[date] ?? (weekday === 0 ? "söndag" : weekday === 6 ? "lördag" : null);
    const halfDay = config.halfDays.includes(date);
    return { known: true, date, market, label: config.label, zone: config.zone, closed: Boolean(reason), reason, halfDay,
        opensAt: reason ? null : zonedInstant(date, config.open, config.zone),
        closesAt: reason ? null : zonedInstant(date, halfDay ? config.halfClose : config.close, config.zone) };
}
export function getMarketStatus(market, now = Date.now()) {
    if (market === "CRYPTO") return { market, label: "Direkt krypto", status: "open", reason: "Öppet 24/7", known: true, nextOpen: null };
    const config = calendars[market];
    if (!config) return { market, known: false, status: "unknown", reason: "Handelsplats saknas" };
    const date = zonedParts(now, config.zone).date;
    const session = tradingSession(market, date);
    if (!session.known) return { ...session, label: config.label, status: "unknown", reason: "Kalendern saknar detta år", nextOpen: null };
    const status = session.closed ? "closed_day" : now < session.opensAt ? "before_open" : now < session.closesAt ? "open" : "after_close";
    let nextOpen = status === "before_open" ? session.opensAt : null;
    if (status !== "open" && nextOpen == null) {
        for (let day = 1; day <= 14; day++) {
            const next = tradingSession(market, addCalendarDays(date, day));
            if (!next.known) break;
            if (!next.closed) { nextOpen = next.opensAt; break; }
        }
    }
    return { ...session, status, nextOpen };
}
export function latestCompletedSession(market, now = Date.now()) {
    const config = calendars[market];
    if (!config) return null;
    const date = zonedParts(now, config.zone).date;
    for (let offset = 0; offset < 15; offset++) {
        const session = tradingSession(market, addCalendarDays(date, -offset));
        if (!session.known) return null;
        if (!session.closed && session.closesAt <= now) return session;
    }
    return null;
}
// Repair UTF-8 bytes mistakenly decoded as Latin-1/Windows-1252 before casing.
// Decode only recognizable mojibake and valid UTF-8; unknown names stay unknown.
const WINDOWS_1252 = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
export function normalizeMarketCode(value) {
    let market = String(value ?? "").trim();
    for (let pass = 0; pass < 2 && /[ÃÂâ]/u.test(market); pass++) {
        const bytes = [];
        for (const char of market) {
            const code = char.codePointAt(0);
            const extended = WINDOWS_1252.indexOf(char);
            if (code > 255 && extended < 0) { bytes.length = 0; break; }
            bytes.push(code <= 255 ? code : 128 + extended);
        }
        if (!bytes.length) break;
        try { market = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); }
        catch { break; }
    }
    const code = market.normalize("NFC").toUpperCase();
    return ({ "STOCKHOLMSBÖRSEN": "XSTO" })[code] ?? code;
}
// Shared listing-code mapping keeps calendar routing and listing validation aligned.
export const LISTING_CALENDARS = Object.freeze({
    ST: "STOCKHOLM", XSTO: "STOCKHOLM", STOCKHOLM: "STOCKHOLM", FNSE: "STOCKHOLM", XSAT: "STOCKHOLM", SPSD: "STOCKHOLM",
    US: "USA", NYSE: "USA", NASDAQ: "USA", XNAS: "USA", XNYS: "USA",
    NASDAQGS: "USA", NASDAQGM: "USA", NASDAQCM: "USA", NYSEARCA: "USA",
});
export function holdingMarket(holding) {
    if (holding.assetType === "CRYPTO" && !holding.isin && holding.productType !== "ETP") return "CRYPTO";
    const market = normalizeMarketCode(holding.market);
    if (LISTING_CALENDARS[market] === "STOCKHOLM" || holding.country === "SE") return "STOCKHOLM";
    if (LISTING_CALENDARS[market] === "USA" || holding.country === "US") return "USA";
    return null;
}
export function dailyMissingReasons(holdings, now = Date.now()) {
    const markets = new Set(holdings.map(holdingMarket).filter(Boolean));
    const reasons = [];
    for (const market of markets) {
        const status = getMarketStatus(market, now);
        if (status.status === "closed_day") reasons.push(`${status.label}-börsen är stängd idag – ${status.reason}.`);
        else if (status.status === "before_open") reasons.push(`${status.label}-börsen har inte öppnat ännu.`);
        else if (!status.known) reasons.push(`${status.label ?? market}: marknadsstatus är okänd.`);
    }
    if (markets.has("CRYPTO")) reasons.push("Direkt krypto är öppet 24/7; saknade kryptovärden beror på kursuppgifterna.");
    return reasons;
}
