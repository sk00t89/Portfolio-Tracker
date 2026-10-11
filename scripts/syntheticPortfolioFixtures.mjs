export const syntheticCatalog=[
    {instrumentId:'synthetic-sek-equity',isin:'SE0000000010',name:'Syntetiska Verkstad B',currency:'SEK',ticker:'TEST-B',market:'XSTO',assetType:'STOCK',basePrice:100},
    {instrumentId:'synthetic-us-equity',isin:'US0000000010',name:'Synthetic Technology Inc',currency:'USD',ticker:'TEST',market:'XNAS',assetType:'STOCK',basePrice:20},
    {instrumentId:'synthetic-nordnet-equity',isin:'SE0000000028',name:'Syntetiska Industri A',currency:'SEK',ticker:'TEST-A',market:'XSTO',assetType:'STOCK',basePrice:50},
    {instrumentId:'synthetic-fund',isin:'SE0000000036',name:'Syntetisk Globalfond',currency:'SEK',assetType:'FUND',basePrice:100},
    {instrumentId:'synthetic-lysa-fund',isin:'SE0000000044',name:'Lysa Synthetic Equities',currency:'SEK',assetType:'FUND',basePrice:100},
    {instrumentId:'synthetic-certificate',isin:'CH0000000010',name:'Syntetiskt kryptocertifikat SEK',currency:'SEK',ticker:'TEST-ETP',market:'XSTO',assetType:'CERTIFICATE',basePrice:10},
];
export const syntheticFiles=[
    {name:'Avanza-syntetisk.csv',text:'Namn;Kortnamn;Volym;Marknadsvärde;GAV SEK;GAV;Valuta;Land;ISIN;Marknad;Typ;Konto;Exportdatum\nSyntetiska Verkstad B;TEST-B;10;1000;75;75;SEK;SE;SE0000000010;STO;STOCK;Avanza-ISK-test;2026-10-04\nSynthetic Technology Inc;TEST;5;1000;150;15;USD;US;US0000000010;XNAS;STOCK;Avanza-ISK-test;2026-10-04\nSyntetisk Globalfond;;10;1000;90;90;SEK;SE;SE0000000036;;FUND;Avanza-ISK-test;2026-10-04\n'},
    {name:'Nordnet-syntetisk.tsv',text:'Namn\tValuta\tAntal\tGAV\tIdag %\tIdag SEK\tSedan köp %\tSedan köp SEK\tMarknadsvärde\nSyntetiska Industri A\tSEK\t10\t40\t0\t0\t25\t100\t500\n'},
    {name:'Lysa-syntetisk.csv',text:'Amount,Counterpart/Fund,Date,Price,Type,Volume\n1000,Lysa Synthetic Equities,2026-10-02,100,Buy,10\n'},
    {name:'Kassa-syntetisk.csv',text:'Konto;Valuta;Saldo;Datum\nAvanza-ISK-test;SEK;1000;2026-10-04\nAvanza-ISK-test;USD;100;2026-10-04\nNordnet-KF-test;SEK;500;2026-10-04\nLysa-ISK-test;SEK;0;2026-10-04\n'},
    {name:'Affarer-syntetiska.csv',text:'Datum;Konto;Typ;ISIN;Antal;Pris;Valuta;Avgift;Referens\n2026-10-05;Avanza-ISK-test;BUY;SE0000000010;1;102;SEK;0;synthetic-trade-001\n2026-10-06;Nordnet-KF-test;SELL;SE0000000028;1;51;SEK;1;synthetic-trade-002\n'},
    {name:'Startinnehav-syntetiska.csv',text:'Konto;ISIN;Namn;Antal;Valuta;Datum\nLysa-ISK-test;SE0000000044;Lysa Synthetic Equities;10;SEK;2026-10-04\nNordnet-KF-test;CH0000000010;Syntetiskt kryptocertifikat SEK;20;SEK;2026-10-04\n'},
];
export const syntheticImportAnswers={'account:Nordnet-syntetisk.tsv':'Nordnet-KF-test','date:Nordnet-syntetisk.tsv':'2026-10-04',
    'instrument:Nordnet-syntetisk.tsv:0':'synthetic-nordnet-equity','account:Lysa-syntetisk.csv':'Lysa-ISK-test',
    'date:Lysa-syntetisk.csv':'2026-10-04','instrument:Lysa-syntetisk.csv:0':'synthetic-lysa-fund','complete:Lysa-syntetisk.csv':true,
    'cashAccount:Avanza-ISK-test':'exclude','cashAccount:Nordnet-KF-test':'exclude',scopeConfirmed:true};
export const fixtureKey=files=>files.map(f=>`${f.name}\n${f.text.replaceAll('\r\n','\n')}`).sort().join('\n---\n');
export function assertSyntheticFiles(files) {
    if(!Array.isArray(files)||!files.length||files.some(f=>!syntheticFiles.some(known=>known.name===f.name&&known.text.replaceAll('\r\n','\n')===f.text?.replaceAll('\r\n','\n'))))
        throw new Error('Den lokala testmiljön accepterar endast de syntetiska demofilerna. Din verkliga portfölj får inte importeras här.');
}
