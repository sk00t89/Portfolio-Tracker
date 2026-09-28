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

    if (quantityNumber <= 0) {
        throw new Error("Antal måste vara större än 0");
    }

    if (priceNumber <= 0) {
        throw new Error("Pris måste vara större än 0");
    }

    return {
        id: crypto.randomUUID(),
        holdingId,
        type,
        quantity: quantityNumber,
        price: priceNumber,
        currency,
        fxRateToSek,
        feeSek,
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

export const applyTransactionToHolding = (holding, transaction) => {
    const quantity = Number(holding.quantity ?? 0);
    const averagePriceSek = Number(holding.averagePriceSek ?? 0);

    const transactionQuantity = Number(transaction.quantity);
    const transactionValueSek = getTransactionValueSek(transaction);

    const currentValueSek =
        Number(holding.currentValueSek ?? 0);

    const currentValuePerUnit =
        quantity > 0
    ? currentValueSek / quantity
            : 0;

    if (transaction.type === "BUY") {
        const oldInvestedValue =
            quantity * averagePriceSek;

        const newQuantity =
            quantity + transactionQuantity;

        const newInvestedValue =
            oldInvestedValue + transactionValueSek;

        const newAveragePriceSek =
            newQuantity > 0
                ? newInvestedValue / newQuantity
                : 0;

        return {
            ...holding,
            quantity: newQuantity,
            averagePriceSek: newAveragePriceSek,
            currentValueSek:
            currentValuePerUnit * newQuantity
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