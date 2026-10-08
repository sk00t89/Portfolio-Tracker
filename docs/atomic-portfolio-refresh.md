# Atomisk presentation av kurser och dagens portföljförändring

## Beteende

Kurskontrollen använder upp till sex parallella instrumentarbeten, med befintlig
deduplicering per användare/instrument och API-förfrågan. Verifierade kurser sparas med
befintliga atomiska identitets-/antalsvillkor i Supabase. React får inga mellanresultat:
alla sparresultat samlas och innehav, kurskontroller, Lysa-resultat och uppdateringsindikator
publiceras tillsammans i slutet. Databassparandet sker fortsatt per innehav, inte genom en
ny transaktion/RPC för hela portföljen. Inga schemaändringar behövs.

Det senaste användarspecifika historikvärdet används under initial dataladdning; om det
saknas visas streck i stället för en delsumma. Under uppdatering behålls det tidigare
visade totalvärdet. Efter batchen beräknas totalen från samma sparade objekt som innehav
och dagsrankning använder. Ingen extra holdings-återläsning startas efter refresh.

Misslyckade kurser behåller tidigare värde och källtid, markeras `quoteStale` i aktuell
UI-session och får en misslyckad kurskontroll. Det blockerar fortfarande historiksparande
och dagens rankning för instrumentet. Supabase ägarskap och samtidighetsvillkor behålls;
användarbyte, redigering eller borttagning under hämtning får inte skrivas över i UI.
Markeringen är inte en ny databaskolumn; efter omladdning gäller vanlig källtidsvalidering
och en ny kurskontroll.

## Idag

Huvudkortet använder alla positioner och deras verkliga föregående stängningskurser,
inte topp tre vinnare/förlorare och inte skillnaden mellan två portföljvärden.
För komplett SEK-underlag: föregående värde = summan av aktuellt SEK-värde multiplicerat
med föregående stängning / aktuell kurs. Procenten använder detta föregående värde som
nämnare. Positiva belopp/procent är gröna och negativa röda. Kapitalförändring sedan start
behålls separat.

NAV utan daterad jämförelse, saknade/stale dagskurser, manuella tillgångar utan dagsjämförelse,
utländska innehav utan verifierad tidigare valutakurs samt dagens registrerade affärer
eller Lysa-insättningar/uttag gör underlaget ofullständigt. Då visas status och aktuell
kurstäckning, ingen påstådd exakt totalavkastning. Täckningen avser kurser; 100 % kurstäckning
kan fortfarande sakna valutans dagsrörelse. Dagens kassaflöden räknas inte som avkastning.
Det finns ingen ny källa för historiska valutakurser eller fondjämförelser i denna ändring.

## Filer och verifiering

- `src/App.jsx`: staging, gemensam publicering, sparat/fryst totalvärde och laddningsstatus.
- `src/utils/atomicQuoteRefresh.js`: testbar parallell batch, säker sammanslagning och val av visad total.
- `src/utils/portfolioDailyChange.js`: portföljberäkning och konservativ underlagsstatus.
- `src/pages/Dashboard.jsx`, `src/components/PortfolioSummary.jsx`, `src/App.css`: huvudkort och status.
- `src/components/HoldingsOverview.jsx`, `src/pages/Holdings.jsx`, `src/utils/dailyQuote.js`: inaktuell kursmarkering och uteslutning ur dagsrörelse.
- `tests/atomicPortfolio.test.mjs`: verkliga App-funktioner, parallellism, en UI-publicering,
  partiella fel, användarbyte/redigering, laddningsvärde och portföljens dagsberäkning.
- `scripts/check-frontend-release.mjs`: skrivskyddad kontroll av publicerad HTML, bundle och API-version.
- `src/services/apiClient.js`, `src/services/marketApiFetch.js`: produktion använder Supabase-projektets
  `market-api` som standard om ingen separat API-URL angetts; localhost är bara utvecklingsstandard.

Tidigare lokala kurs- och DailyMovers-rättningar ingår också i frontendpubliceringen,
eftersom de behövs för den redan publicerade `market-quotes-v2`-funktionen.
Inga migrationsfiler eller databasuppdateringar körs. Befintliga historiska värden skrivs inte om.

Lokala tester, lint, build och skrivskyddad driftkontroll av sex instrument körs före push.
Produktionsdeployment sker genom projektets befintliga GitHub -> Vercel-integration på `main`.
Den driftsatta Edge Function är redan kompatibel; ingen ny Edge-deployment krävs.
