// Pure replay; this module never updates holdings, snapshots, or browser storage.
export const PERFORMANCE_CONVENTION = "stockholm_end_of_day_v1";
export const isDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const isAmount = value => typeof value === "number" && Number.isFinite(value);
const currency = value => /^[A-Z]{3}$/.test(value ?? "");
const require = (condition, reason) => { if (!condition) throw new Error(reason); };
const cashKey = (accountId, code) => JSON.stringify([accountId, code]);
const positionKey = (accountId, instrumentId) => JSON.stringify([accountId, instrumentId]);

export function validateLedgerEvent(event) {
    require(event && event.id && event.source?.trim() && event.verified === true && isDate(event.date)
        && event.accountId && currency(event.currency), "Transaktionen saknar verifierat underlag.");
    require(["BUY", "SELL", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "FEE", "FX", "TRANSFER"].includes(event.kind), "Okänd transaktionstyp.");
    require(isAmount(event.amount) && event.amount > 0, "Transaktionsbelopp saknas.");
    if (["BUY", "SELL"].includes(event.kind)) {
        require(event.instrumentId && isAmount(event.quantity) && event.quantity > 0, "Antal eller instrument saknas.");
    }
    if (["BUY", "SELL", "FX"].includes(event.kind)) {
        require(event.fee && isAmount(event.fee.amount) && event.fee.amount >= 0 && currency(event.fee.currency),
            "Avgiften är okänd. Bekräfta även en avgift på 0.");
    }
    if (["DEPOSIT", "WITHDRAWAL"].includes(event.kind)) {
        require(isAmount(event.fxRateToSek) && event.fxRateToSek > 0 && (event.currency !== "SEK" || event.fxRateToSek === 1),
            "Historisk valutakurs för kapitalflödet saknas.");
        if (event.occurredAt != null) {
            const time = Date.parse(event.occurredAt);
            require(typeof event.occurredAt === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(event.occurredAt)
                && Number.isFinite(time) && new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(time)) === event.date,
                "Kapitalflödets faktiska tidpunkt stämmer inte med bokföringsdatumet.");
        }
    }
    if (event.kind === "FX") {
        require(currency(event.toCurrency) && event.toCurrency !== event.currency && isAmount(event.toAmount) && event.toAmount > 0,
            "Växlingens båda belopp saknas.");
    }
    if (event.kind === "TRANSFER") require(event.toAccountId && event.toAccountId !== event.accountId, "Överföringens mottagarkonto saknas.");
    return event;
}

export function replayPerformanceLedger(baseline, events, throughDate) {
    require(baseline?.verified === true && baseline.coverage === "complete" && baseline.source?.trim()
        && isDate(baseline.date) && isDate(throughDate) && throughDate >= baseline.date
        && Array.isArray(baseline.positions) && Array.isArray(baseline.cash) && baseline.cash.length > 0, "Verifierad öppningsbalans inklusive kassa saknas.");
    const cash = new Map(), positions = new Map();
    for (const entry of baseline.cash) {
        const key = cashKey(entry.accountId, entry.currency);
        require(entry.accountId && currency(entry.currency) && isAmount(entry.amount) && entry.amount >= 0 && !cash.has(key), "Ogiltig öppningskassa.");
        cash.set(key, { ...entry });
    }
    for (const entry of baseline.positions) {
        const key = positionKey(entry.accountId, entry.instrumentId);
        require(entry.accountId && entry.instrumentId && currency(entry.currency) && isAmount(entry.quantity) && entry.quantity >= 0 && !positions.has(key), "Ogiltiga öppningsinnehav.");
        positions.set(key, { ...entry });
    }
    for (const entry of baseline.positions) require([...cash.values()].some(account => account.accountId === entry.accountId), "Innehavets verifierade kontokassa saknas.");
    const seen = new Set(), references = new Set(), externalFlows = [];
    const selected = events.map(validateLedgerEvent).filter(event => event.date <= throughDate);
    selected.sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
    const changeCash = (accountId, code, delta) => {
        const key = cashKey(accountId, code), current = cash.get(key);
        require(current, "Kassakonto saknas i öppningsbalansen.");
        const amount = current.amount + delta;
        require(amount >= -1e-8, "Kassan räcker inte. Registrera verifierad finansiering eller öppningskassa.");
        cash.set(key, { ...current, amount: Math.max(0, amount) });
    };
    const order = new Set();
    for (const event of selected) {
        require(event.date > baseline.date, "Affär på eller före öppningsdatum kräver avstämning mot öppningsbalansen.");
        require(Number.isSafeInteger(event.sequence) && event.sequence >= 0 && !order.has(`${event.date}:${event.sequence}`), "Affärernas ordning är okänd eller dubbel.");
        order.add(`${event.date}:${event.sequence}`);
        require(!seen.has(event.id), "Dubbel transaktion.");
        seen.add(event.id);
        if (event.externalReference) {
            const reference = `${event.accountId}:${event.source}:${event.externalReference}`;
            require(!references.has(reference), "Importen innehåller en redan registrerad affär.");
            references.add(reference);
        }
        if (["BUY", "SELL"].includes(event.kind)) {
            const key = positionKey(event.accountId, event.instrumentId), entry = positions.get(key);
            require(!entry || entry.currency === event.currency, "Affärens valuta stämmer inte med innehavet.");
            const quantity = (entry?.quantity ?? 0) + (event.kind === "BUY" ? event.quantity : -event.quantity);
            require(quantity >= -1e-8, "Försäljningen överstiger historiskt innehav.");
            positions.set(key, { accountId: event.accountId, instrumentId: event.instrumentId, currency: event.currency, quantity: Math.max(0, quantity) });
            changeCash(event.accountId, event.currency, event.kind === "BUY" ? -event.amount : event.amount);
        } else if (event.kind === "FX") {
            changeCash(event.accountId, event.currency, -event.amount);
            changeCash(event.accountId, event.toCurrency, event.toAmount);
        } else if (event.kind === "TRANSFER") {
            changeCash(event.accountId, event.currency, -event.amount);
            changeCash(event.toAccountId, event.currency, event.amount);
        } else {
            const out = ["WITHDRAWAL", "FEE"].includes(event.kind);
            changeCash(event.accountId, event.currency, out ? -event.amount : event.amount);
            if (["DEPOSIT", "WITHDRAWAL"].includes(event.kind)) externalFlows.push({ ...event,
                amountSek: (out ? -1 : 1) * event.amount * event.fxRateToSek });
        }
        if (event.fee) changeCash(event.accountId, event.fee.currency, -event.fee.amount);
    }
    return { cash: [...cash.values()], positions: [...positions.values()], externalFlows };
}

export function valuePerformanceLedger(state, date, prices, rates) {
    require(isDate(date), "Värderingsdatum saknas.");
    // Explicit carry policy keeps the real source date. A holiday/delayed NAV is
    // not a new price observation. A trusted calendar adapter must certify it.
    const applies = item => item.date === date || (item.valuationDate === date && item.carryPolicy === "last_published"
        && item.calendarVerified === true && isDate(item.date) && item.date < date
        && Date.parse(date) - Date.parse(item.date) <= 7 * 86400000);
    const rate = code => {
        if (code === "SEK") return 1;
        const observation = rates.find(item => item.from === code && item.to === "SEK" && applies(item));
        require(observation?.verified === true && observation.source?.trim() && isAmount(observation.rate) && observation.rate > 0,
            "Historisk valutakurs saknas för värderingsdatumet.");
        require(rates.filter(item => item.from === code && item.to === "SEK" && applies(item)).length === 1, "Motstridiga valutakurser.");
        return observation.rate;
    };
    let valueSek = 0;
    for (const entry of state.cash) valueSek += entry.amount * rate(entry.currency);
    for (const entry of state.positions) {
        if (entry.quantity === 0) continue;
        const matches = prices.filter(item => item.instrumentId === entry.instrumentId && applies(item));
        const observation = matches[0];
        require(matches.length === 1 && observation?.verified === true && observation.source?.trim()
            && observation.currency === entry.currency && isAmount(observation.price) && observation.price > 0,
            "Historiskt pris/NAV saknas eller är motstridigt.");
        valueSek += entry.quantity * observation.price * rate(entry.currency);
    }
    require(Number.isFinite(valueSek), "Ogiltigt portföljvärde.");
    return valueSek;
}
