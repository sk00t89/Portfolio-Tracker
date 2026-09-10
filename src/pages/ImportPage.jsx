function ImportPage() {

    const avanzaRow =
        "AbCellera Biologics;ABCL;555;61210,88;34,57;3,71;USD;US;CA00288U1066;XNAS;STOCK";
    const avanzaData1 = avanzaRow.replaceAll(",",".").split(";");


    console.log(avanzaData1);

    const holdings = [
        {
            name: avanzaData1[0],
            ticker: avanzaData1[1],
            quantity: Number(avanzaData1[2]),
            valueSek: Number(avanzaData1[3]),
            averagePriceSek: Number(avanzaData1[4]),
            averagePrice: Number(avanzaData1[5]),
            currency: avanzaData1[6],
            country: avanzaData1[7],
            isin: avanzaData1[8],
            market: avanzaData1[9],
            assetType: avanzaData1[10],

        }
    ]

console.log(holdings);

    return (
        <div>
            <h1>Import</h1>
        </div>
    );
}

export default ImportPage;