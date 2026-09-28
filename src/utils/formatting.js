export const formatSek = (value) => {
    return value.toLocaleString("sv-SE", {
        maximumFractionDigits: 0
    }) + " kr";
};

export const formatCurrency = (
    value,
    currency = "SEK"
) => {
    const number = Number(value ?? 0);

    return new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency,
        minimumFractionDigits: number < 1 ? 2 : 0,
        maximumFractionDigits: number < 1 ? 4 : 2,
    }).format(number);
};