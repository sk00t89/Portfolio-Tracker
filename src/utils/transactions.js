export const createTransaction = ({
    holdingId,
    type,
    quantity,
    price,
    currency = "SEK",
    fxRateToSek = 1,
    feeSek = 0,
    date = new Date().toISOString(),
}) => {
    const quantityNumber = Number(quantity);
    const priceNumber = Number(price);
    const fxRateNumber = Number(fxRateToSek);
    const feeSekNumber = Number(feeSek || 0);

    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
        throw new Error("Antal måste vara större än 0");
    }

    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
        throw new Error("Pris måste vara större än 0");
    }

    if (!Number.isFinite(fxRateNumber) || fxRateNumber <= 0) {
        throw new Error("Ogiltig valutakurs");
    }

    if (!Number.isFinite(feeSekNumber) || feeSekNumber < 0) {
        throw new Error("Avgiften kan inte vara negativ");
    }

    if (type !== "BUY" && type !== "SELL") {
        throw new Error("Ogiltig transaktionstyp");
    }

    return {
        id: crypto.randomUUID(),
        holdingId,
        type,
        quantity: quantityNumber,
        price: priceNumber,
        currency,
        fxRateToSek: fxRateNumber,
        feeSek: feeSekNumber,
        date,
    };
};

export const getTransactionValueSek = (transaction) => {
    const baseValue =
        transaction.quantity *
        transaction.price *
        transaction.fxRateToSek;

    if (transaction.type === "BUY") {
        return baseValue + transaction.feeSek;
    }

    if (transaction.type === "SELL") {
        return baseValue - transaction.feeSek;
    }

    return baseValue;
};

export const applyTransactionToHolding = (
    holding,
    transaction
) => {
    const quantity =
        Number(holding.quantity ?? 0);

    const averagePriceSek =
        Number(holding.averagePriceSek ?? 0);

    const averagePrice =
        Number(holding.averagePrice ?? 0);

    const transactionQuantity =
        Number(transaction.quantity);

    const transactionValueSek =
        getTransactionValueSek(transaction);

    const currentValueSek =
        Number(holding.currentValueSek ?? 0);

    const currentValuePerUnit =
        quantity > 0
            ? currentValueSek / quantity
            : 0;

    if (transaction.type === "BUY") {
        const oldInvestedValue =
            quantity * averagePriceSek;

        const oldInvestedValueLocal =
            quantity * averagePrice;

        const newQuantity =
            quantity + transactionQuantity;

        const newInvestedValue =
            oldInvestedValue + transactionValueSek;

        const transactionValueLocal =
            transactionQuantity * transaction.price;

        const newInvestedValueLocal =
            oldInvestedValueLocal + transactionValueLocal;

        const newAveragePriceSek =
            newQuantity > 0
                ? newInvestedValue / newQuantity
                : 0;

        const newAveragePrice =
            newQuantity > 0
                ? newInvestedValueLocal / newQuantity
                : 0;

        return {
            ...holding,
            quantity: newQuantity,
            averagePrice: newAveragePrice,
            averagePriceSek: newAveragePriceSek,
            currentValueSek:
                currentValuePerUnit * newQuantity,
        };
    }

    if (transaction.type === "SELL") {
        const newQuantity =
            quantity - transactionQuantity;

        if (newQuantity < 0) {
            throw new Error(
                "Du kan inte sälja fler än du äger"
            );
        }

        return {
            ...holding,
            quantity: newQuantity,
            currentValueSek:
                currentValuePerUnit * newQuantity,
        };
    }

    return holding;
};
