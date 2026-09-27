export const mergeInstrumentsResults = (
    nordnetResults,
    avanzaResults
) => {
    const allData = [
        ...nordnetResults,
        ...avanzaResults,
    ];

    const uniqueResults = [];

    allData.forEach((instrument) => {
        const alreadyExists = uniqueResults.some(
            (existingInstrument) => {

                if (
                    instrument.isin &&
                    existingInstrument.isin
                ) {
                    return (
                        instrument.isin ===
                        existingInstrument.isin
                    );
                }

                if (
                    instrument.ticker &&
                    existingInstrument.ticker &&
                    instrument.currency &&
                    existingInstrument.currency
                ) {
                    return (
                        instrument.ticker ===
                        existingInstrument.ticker &&
                        instrument.currency ===
                        existingInstrument.currency
                    );
                }

                return (
                    instrument.name ===
                    existingInstrument.name &&
                    instrument.currency ===
                    existingInstrument.currency
                );
            }
        );

        if (!alreadyExists) {
            uniqueResults.push(instrument);
        }
    });

    return uniqueResults;
};