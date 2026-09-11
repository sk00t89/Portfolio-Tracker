export const formatSek = (value) => {
    return value.toLocaleString("sv-SE", {
        maximumFractionDigits: 0
    }) + " kr";
};