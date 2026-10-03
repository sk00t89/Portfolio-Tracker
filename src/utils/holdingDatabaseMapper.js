export function databaseHoldingToApp(row) {
    return {
        id: row.id,
        accountId: row.account_id ?? null,
        name: row.name,
        ticker: row.ticker ?? null,
        isin: row.isin ?? null,
        quantity: Number(row.quantity ?? 0),
        averagePrice:
            row.average_price == null
                ? null
                : Number(row.average_price),
        averagePriceSek:
            row.average_price_sek == null
                ? null
                : Number(row.average_price_sek),
        currentPrice:
            row.current_price == null
                ? null
                : Number(row.current_price),
        currentValueSek:
            row.current_value_sek == null
                ? null
                : Number(row.current_value_sek),
        valueSek:
            row.value_sek == null
                ? null
                : Number(row.value_sek),
        currency: row.currency ?? null,
        platform: row.platform ?? null,
        assetType: row.asset_type ?? null,
        category: row.category ?? null,
        country: row.country ?? null,
        market: row.market ?? null,
        instrumentId: row.instrument_id ?? null,
        provider: row.provider ?? null,
        priceUpdatedAt:
            row.price_updated_at == null
                ? null
                : Number(row.price_updated_at),
    };
}

export function appHoldingToDatabase(holding) {
    return {
        ...(holding.id ? { id: holding.id } : {}),
        account_id: holding.accountId ?? holding.account_id ?? null,
        name: holding.name,
        ticker: holding.ticker ?? null,
        isin: holding.isin ?? null,
        quantity: holding.quantity ?? null,
        average_price: holding.averagePrice ?? null,
        average_price_sek: holding.averagePriceSek ?? null,
        current_price: holding.currentPrice ?? null,
        current_value_sek: holding.currentValueSek ?? null,
        value_sek: holding.valueSek ?? null,
        currency: holding.currency ?? null,
        platform: holding.platform ?? null,
        asset_type: holding.assetType ?? null,
        category: holding.category ?? null,
        country: holding.country ?? null,
        market: holding.market ?? null,
        instrument_id:
            holding.instrumentId == null
                ? null
                : String(holding.instrumentId),
        provider: holding.provider ?? null,
        price_updated_at: holding.priceUpdatedAt ?? null,
        updated_at: new Date().toISOString(),
    };
}
