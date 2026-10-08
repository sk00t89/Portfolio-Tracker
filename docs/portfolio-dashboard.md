# Integrerad portföljdashboard

Huvudkortet samlar aktuellt portföljvärde, insatt kapital, dagens verifierade förändring/kurstäckning, kapitalförändring och sparad historik. Kursuppdateringens befintliga atomiska state-flöde är oförändrat. Hover, pointer/touch och ett tangentbordsstyrt reglage väljer verkliga observationer utan att ändra huvudvärdet.

## Perioder och värdeförändring

1D, 1V, 1M, 3M, i år, 1Å och ALL använder samma periodmodell för graf, kronor, procent och jämförelse. Endast verkliga `portfolio_daily_values` används; komponenterna skriver inget till Supabase. Ogiltiga/framtida observationer och motstridiga datum utesluts. Grafens räta linjer sammanbinder observationerna; inga mellanliggande datapunkter genereras.

1D kräver dagens och gårdagens sparade dagsvärden. Det finns ingen intradagshistorik. Övriga kalenderperioder behöver en verklig startobservation på eller högst tre dagar före periodgränsen, samt en senaste observation högst en dag gammal. En senare start får inte förkorta perioden. Faktiska datum visas. Saknat underlag ger tomt läge, aldrig en tyst övergång till ALL. ALL visar alla giltiga observationer, även när marknaden är stängd.

Periodbeloppen är **värdeförändring**, inklusive insättningar/uttag. De betecknas inte som investeringsavkastning. Befintlig kapitalförändring mot insatt kapital och den strikt verifierade dagsberäkningen behålls. Historiken ligger i SEK. Vid annan visningsvaluta konverteras visningsbelopp med aktuell kurs, tydligt märkt; periodens procent beräknas på SEK-värdena, inte på uppskattad historisk FX.

## Indexadapter — förberedd, ännu inte ansluten

Valen OMXS30, SIXRX och S&P 500 finns. Ingen extern indexkälla eller API-nyckel har lagts till. Appen levererar ännu varken verifierade indexserier eller ett komplett underlag för tidsvägd portföljavkastning. Jämförelsen visar därför uttryckligen att den är otillgänglig.

`PortfolioSummary` kan senare ta emot `portfolioReturns` och `benchmarks`, med serier för samma exakta start/slut och värderingstidpunkter. `compareVerifiedBenchmark` kräver:

- `verified: true`, dokumenterad `source`, `currency: "SEK"`, `cadence: "daily_close"`.
- Samma `returnBasis`: `price_return`, `gross_total_return` eller `net_total_return`.
- Portfölj: `method: "TWR"`, `cashFlowCoverage: "complete"`. Adaptern måste beräkna detta från ett verifierat kassaflödesregister och korrekta värderingar, inte från skillnaden mellan dagsvärden.
- Index: `id` måste vara `OMXS30`, `SIXRX` eller `SP500`.
- Varje `points`-observation har `date` (YYYY-MM-DD), positivt ändligt numeriskt `value` (avkastningsindex) och verklig `asOf` (ISO-tid). Strikt stigande datum, exakta periodändpunkter, matchande faktiska värderingstider, inga framtida observationer.

Den framtida adaptern ska hämta autentiserad, källverifierad data. `verified` är ett adapterkontrakt, inte ett bevis som får accepteras från användarinmatning eller godtycklig JSON. Historisk FX för ett index i USD måste hämtas verifierat och tidsmässigt matchat; aktuell FX får inte ersätta historisk FX. Det finns ingen interpolation, uppskattad valutaomräkning eller automatisk växling av avkastningsbas.

När hela kontraktet är uppfyllt ritas normaliserad portföljavkastning och index i procent, samt över-/underprestation i procentenheter med symbol. Ovanstående värdeförändring är fortfarande separat från denna avkastning.

Återstående beslut: licensierad/verifierad indexhistorik, val av utdelningsbas och datum/tid/valutakonvention, komplett kassaflödesregister samt betrodd adapter. Prisindex och totalavkastningsindex får inte blandas. Primär metodreferens: [Nasdaq OMXS30](https://indexes.nasdaq.com/docs/Methodology_OMXS30.pdf), [S&P indexmatematik](https://www.spglobal.com/spdji/en/methodology/article/index-mathematics-methodology/).

## Kontroller och deployment

Regressionstester kontrollerar verkliga periodgränser, saknat underlag, konflikter/framtida datum, kassaflödesskydd, indexkontrakt och val av observationer. Render-testet kontrollerar huvudvärde under uppdatering, ofullständiga dagsuppgifter och bevarad historik. Visuell desktop/mobilkontroll använder en ignorerad lokal förhandsvisning med två verkliga observationer och utan appens sparfunktioner.

Frontend publiceras via befintlig GitHub → Vercel Production-integration. `scripts/check-frontend-release.mjs` kontrollerar också att den publicerade JavaScript-filen innehåller det integrerade huvudkortet och avkastningsskyddet. Ingen ändring av Edge Functions, databasschema, RLS eller historiska värden ingår.
