const parseCsvRow = (row) => {
    const columns = [];
    let currentValue = "";
    let insideQuotes = false;

    for (let i = 0; i < row.length; i++) {
        const character = row[i];

        if (character === '"') {
            insideQuotes = !insideQuotes;
            continue;
        }

        if (character === "," && !insideQuotes) {
            columns.push(currentValue);
            currentValue = "";
            continue;
        }

        currentValue += character;
    }

    columns.push(currentValue);

    return columns;
};

const parseNumber = (value) => {
    if (!value) {
        return null;
    }

    return Number(
        value.replace(",", ".")
    );
};

const parseLysaTransactionsCsv = (string) => {
    const rows = string
        .split("\n")
        .filter((row) => row.trim() !== "");

    const dataRows = rows.slice(1);

    return dataRows.map((row) => {
        const columns = parseCsvRow(row);

        const [
            amount,
            counterpart,
            date,
            price,
            type,
            volume
        ] = columns;

        return {
            amountSek: parseNumber(amount),
            fundName: counterpart || null,
            date: date || null,
            price: parseNumber(price),
            type: type || null,
            volume: parseNumber(volume),
            platform: "Lysa",
        };
    });
};

export default parseLysaTransactionsCsv;