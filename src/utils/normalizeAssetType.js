const normalizeAssetType = (assetType) => {
    if (!assetType) {
        return null;
    }

    const type = assetType.toLowerCase();

    if (
        type === "stock" ||
        type === "common stock"
    ) {
        return "STOCK";
    }

    if (
        type === "certificate" ||
        type === "etp"
    ) {
        return "CERTIFICATE";
    }

    return assetType.toUpperCase();
};

export default normalizeAssetType;