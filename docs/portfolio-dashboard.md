# Integrerad portföljdashboard

Huvudkortet samlar aktuellt portföljvärde, insatt kapital, dagens verifierade förändring/kurstäckning, kapitalförändring och sparad historik. Kursuppdateringens befintliga atomiska state-flöde är oförändrat. Hover, pointer/touch och ett tangentbordsstyrt reglage väljer verkliga observationer utan att ändra huvudvärdet.

## Perioder och värdeförändring

1D, 1V, 1M, 3M, i år, 1Å och ALL använder samma periodmodell för kronor, procent och grafens observationer. Längre perioder kombinerar verkliga `portfolio_daily_values` med dagens verifierade livevärde. Komponenterna skriver inget till Supabase. Ogiltiga/framtida observationer och motstridiga datum utesluts. Grafens räta linjer sammanbinder observationerna; inga mellanliggande datapunkter genereras.

1D använder `calculatePortfolioDailyChange` när hela underlaget är verifierat, inklusive relevant handelsdag, föregående stängning, valuta och dagens kassaflöden. Sparade dagsvärden behövs inte för siffrorna. Ingen intradagskurva ritas eftersom intradagshistorik saknas. Vid ofullständigt underlag visas status/kurstäckning, ingen exakt avkastning.

Grafens visningsfilter och periodjämförelsens täckningskontroll är separata. För 1V, 1M, 3M, i år och 1Å visas alla giltiga observationer från kalenderperiodens början till idag, även om historiken börjar senare. Vid kortare historik visas **Historik tillgänglig sedan …** och **Periodens avkastning kan ännu inte beräknas**. En ensam observation visas som en punkt, utan linje eller fylld yta. Ett tomt tidsfönster ger tomt läge. ALL visar alla giltiga observationer, även när marknaden är stängd.

Periodens kronor/procent och indexjämförelse behöver fortsatt en jämförbar verklig startobservation på eller högst tre dagar före periodgränsen, samt en senaste observation högst en dag gammal. En senare start får inte förkorta perioden. Beräkningsunderlaget hålls separat från grafens punkter; en eventuell startobservation före tidsfönstret anges uttryckligen och ritas inte som en punkt inom perioden. Saknad täckning ger inga fullperiodbelopp, procentsiffror eller indexresultat. Kontrollen för investeringsavkastning med kompletta kassaflöden kvarstår.

## Dagens levande slutpunkt

Appens atomiska commit publicerar också `quotePublication` med autentiserad användare och faktisk batchsluttid. Detta är **vår publiceringstid**, inte leverantörens kurstid. Livepunkten kräver samma strikta `validateValuationFreshness` som historiken, färdigladdade värden, rätt användare och en publicering idag inom 20 minuter. En äldre publicering eller en partiellt misslyckad kursuppdatering får inte presenteras som en ny verifierad observation.

Under pågående uppdatering hålls totalvärdet fryst enligt befintligt flöde, med tidigare verifierad punkt så länge den fortfarande är giltig. Den nya slutpunkten publiceras tillsammans med hela kurspaketet. Verifieringen använder en aktuell utvärderingsklocka, så en tidigare marknadsstatustimer inte fördröjer visningen till nästa tick.

`mergeLiveHistory` ersätter dagens punkt endast i en ny visningsarray. Äldre datum och indataobjekt lämnas orörda. Om dagens snapshot saknas läggs en enda livepunkt till, utan att fylla historiska luckor. Senare återläsning av dagens snapshot ändrar inte det aktuella livevärdet. Funktionen gör inga RPC-anrop och påverkar inte det befintliga snapshotflödet. Livepunkten märks uttryckligen i graf och bildtext; om den inte kan verifieras visas sparad historik.

Periodbeloppen är **värdeförändring**, inklusive insättningar/uttag. De betecknas inte som investeringsavkastning. Befintlig kapitalförändring mot insatt kapital och den strikt verifierade dagsberäkningen behålls. Historiken ligger i SEK. Vid annan visningsvaluta konverteras visningsbelopp med aktuell kurs, tydligt märkt; periodens procent beräknas på SEK-värdena, inte på uppskattad historisk FX.

## Fristående indexhistorik och skyddad portföljjämförelse

OMXS30 och S&P 500 kan nu väljas som fristående prisindex med historiska dagsstängningar från Yahoo Finance, via en gemensam Express/market-api-adapter. SIXRX förblir inaktivt. Perioder, verifiering, felhantering och kvarstående begränsningar beskrivs i [index-history.md](index-history.md). Indexkurvan normaliseras från första verkliga observationen i perioden och använder sin ursprungsvaluta. Denna adapter ger inget underlag för portföljjämförelse och skapar inga portföljvärden. Appen saknar fortfarande ett komplett verifierat TWR-/kassaflödesunderlag; jämförelse mot portföljen är avstängd.

`PortfolioSummary` kan senare ta emot `portfolioReturns` och `benchmarks`, med serier för samma exakta start/slut och värderingstidpunkter. `compareVerifiedBenchmark` kräver:

- `verified: true`, dokumenterad `source`, `currency: "SEK"`, `cadence: "daily_close"`.
- Samma `returnBasis`: `price_return`, `gross_total_return` eller `net_total_return`.
- Portfölj: `method: "TWR"`, `cashFlowCoverage: "complete"`. Adaptern måste beräkna detta från ett verifierat kassaflödesregister och korrekta värderingar, inte från skillnaden mellan dagsvärden.
- Index: `id` måste vara `OMXS30`, `SIXRX` eller `SP500`.
- Varje `points`-observation har `date` (YYYY-MM-DD), positivt ändligt numeriskt `value` (avkastningsindex) och verklig `asOf` (ISO-tid). Strikt stigande datum, exakta periodändpunkter, matchande faktiska värderingstider, inga framtida observationer.

Den framtida adaptern ska hämta autentiserad, källverifierad data. `verified` är ett adapterkontrakt, inte ett bevis som får accepteras från användarinmatning eller godtycklig JSON. Historisk FX för ett index i USD måste hämtas verifierat och tidsmässigt matchat; aktuell FX får inte ersätta historisk FX. Det finns ingen interpolation, uppskattad valutaomräkning eller automatisk växling av avkastningsbas.

När hela kontraktet för historiska slutvärden är uppfyllt ritas normaliserad portföljavkastning och index i procent, samt över-/underprestation i procentenheter med symbol. Ovanstående värdeförändring är fortfarande separat från denna avkastning. En levande slutpunkt blockeras uttryckligen från denna jämförelse: en gammal daglig indexstängning får inte jämföras med dagens aktuella portföljvärde. Dynamisk jämförelse kräver en ny betrodd liveadapter med gemensam start, faktisk jämförbar värderingstid/marknadssession, realtidsindex (eller tydligt verifierad fördröjning), matchad FX och kassaflödeskorrigerad liveavkastning. Denna adapter finns ännu inte.

Återstående beslut: licensierad/verifierad indexhistorik, val av utdelningsbas och datum/tid/valutakonvention, komplett kassaflödesregister samt betrodd adapter. Prisindex och totalavkastningsindex får inte blandas. Primär metodreferens: [Nasdaq OMXS30](https://indexes.nasdaq.com/docs/Methodology_OMXS30.pdf), [S&P indexmatematik](https://www.spglobal.com/spdji/en/methodology/article/index-mathematics-methodology/).

## Kontroller och deployment

Regressionstester kontrollerar verkliga periodgränser, saknat underlag, konflikter/framtida datum, kassaflödesskydd, indexkontrakt och val av observationer. Render-testet kontrollerar huvudvärde under uppdatering, ofullständiga dagsuppgifter och bevarad historik. Visuell desktop/mobilkontroll använder en ignorerad lokal förhandsvisning med två verkliga observationer och utan appens sparfunktioner.

Frontend publiceras via befintlig GitHub → Vercel Production-integration. `scripts/check-frontend-release.mjs` kontrollerar också att den publicerade JavaScript-filen innehåller det integrerade huvudkortet och avkastningsskyddet. Ingen ändring av Edge Functions, databasschema, RLS eller historiska värden ingår.
