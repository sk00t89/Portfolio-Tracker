const parseLysaPerformanceCsv = (string) => {
    const rows = string
        .split("\n")
        .filter((row) => row.trim() !== "");

    const dataRows = rows.slice(1);

    return dataRows.map((row) => {
        const columns = row.split(",");

        const [
            accountWorth,
            accumulatedGrowth,
            date,
            performanceIndex
        ] = columns;

        return {
            accountWorth: Number(accountWorth),
            accumulatedGrowth: Number(accumulatedGrowth),
            date: date || null,
            performanceIndex: Number(performanceIndex),
            platform: "Lysa",
        };
    });
};

export default parseLysaPerformanceCsv;