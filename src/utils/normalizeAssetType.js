const normalizeAssetType = (assetType) => {
    if (!assetType) {
        return null;
    }

    const type = assetType
        .toString()
        .trim()
        .toLowerCase()
        .replaceAll(" ", "_");

    if (
        type === "stock" ||
        type === "common_stock"
    ) {
        return "STOCK";
    }

    if (
        type === "fund" ||
        type === "mutual_fund" ||
        type === "exchange_traded_fund" ||
        type === "etf"
    ) {
        return "FUND";
    }

    if (
        type === "certificate" ||
        type === "etp" ||
        type === "tracker"
    ) {
        return "CERTIFICATE";
    }

    return assetType.toString().toUpperCase();
};

export default normalizeAssetType;
