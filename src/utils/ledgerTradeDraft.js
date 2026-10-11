import { isAmount, isDate } from "./performanceLedger.js";

// Draft only: no persistence, no automatic funding, no inferred zero fees/FX.
export function prepareLedgerTradeDraft({ position, kind, quantity, price, date, feeAmount, feeCurrency = position?.currency, funding, externalReference, settlement = 'currency_cash', settlementAmountSek }) {
    if (!position?.accountId || !position.instrumentId || !/^[A-Z]{3}$/.test(position.currency ?? "")) throw new Error("Kontot, instrumentet eller valutan saknas.");
    if (!["BUY", "SELL"].includes(kind) || !isDate(date)) throw new Error("Affärstyp eller affärsdatum är ogiltigt.");
    const units = Number(quantity), unitPrice = Number(price);
    if (!(units > 0) || !(unitPrice > 0) || !Number.isFinite(units * unitPrice)) throw new Error("Antal och pris måste vara större än 0.");
    if (kind === "BUY" && !["existing_cash", "external_money"].includes(funding)) throw new Error("Välj befintlig kassa eller nya externa pengar.");
    const fee = feeAmount == null || (typeof feeAmount === "string" && !feeAmount.trim()) ? null : Number(feeAmount);
    if (fee != null && (!isAmount(fee) || fee < 0)) throw new Error("Avgiften är ogiltig.");
    if (![position.currency,'SEK'].includes(feeCurrency)) throw new Error('Bekräfta avgiftens valuta.');
    if (!['currency_cash','broker_conversion'].includes(settlement) || settlement === 'broker_conversion' && position.currency === 'SEK') throw new Error('Välj hur affären avräknades.');
    const sek = Number(settlementAmountSek);
    if (settlement === 'broker_conversion' && (!(sek > 0) || !Number.isFinite(sek) || funding === 'external_money')) throw new Error('Ange mäklarens faktiska totala SEK-belopp. Registrera eventuell insättning separat.');
    return { accountId: position.accountId, instrumentId: position.instrumentId, currency: position.currency,
        kind, quantity: units, amount: units * unitPrice, unitPrice, date,
        fee: fee == null ? null : { amount: fee, currency: feeCurrency },feeCurrency,
        funding: kind === "SELL" ? "existing_cash" : funding, externalReference: externalReference || null,
        ...(settlement === 'broker_conversion' ? {settlement, settlementAmountSek:sek} : {}),
        // Unknowns must be reconciled before this draft can become a verified ledger event.
        verified: false, missing: [...(fee == null ? ["fee"] : []), ...(funding === "external_money" && kind === "BUY" ? ["external_deposit"] : [])] };
}
