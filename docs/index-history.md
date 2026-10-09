# Fristående indexhistorik

Dashboardens väljare visar OMXS30 eller S&P 500 separat från portföljhistoriken. SIXRX är förberett men inaktivt. Befintliga portföljvärden, snapshotflöden och skydd för TWR/kassaflöden behålls. Indexadaptern producerar inget `verified`-kontrakt för portföljjämförelse och aktiverar ingen över-/underprestation.

## Källa och verifiering

Yahoo Finance chart API: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}` med `interval=1d`, `period1`, `period2`. Adaptern kontrollerar exakt symbol, INDEX, valuta, handelsplats, IANA-tidszon och daglig granularitet. OMXS30: `^OMX`, SEK, STO, Europe/Stockholm. S&P 500: `^GSPC`, USD, SNP, America/New_York. Vanlig `close` används, inte adjusted close, realtidspris eller previousClose. Båda visas som prisindex utan utdelningar och utan valutaomräkning.

Läsande liveverifiering 2026-10-09 med `node scripts/check-index-history.mjs` gav HTTP 200 och godkänd adaptervalidering för alla tolv kombinationer av index och period. Nätverkssandboxens direkta anrop misslyckades; samma anrop utanför sandboxen lyckades. Senaste accepterade slutkurs var 2026-10-08 för båda indexen.

| Period | OMXS30 observationer | S&P 500 observationer |
| --- | ---: | ---: |
| 1V | 5 | 5 |
| 1M | 22 | 22 |
| 3M | 66 | 65 |
| i år | 194 | 193 |
| 1Å | 250 | 251 |
| ALL | 2509 | 2513 |

OMXS30 ALL hade fem null-slutkurser som utelämnades. Ingen ersättningskurs skapades. Detta verifierar källa och den gemensamma adaptern från denna miljö; det garanterar inte tillgänglighet från Supabases nätverk.

## Datum, täckning och normalisering

Periodgränser beräknas i respektive index lokala tidszon. ALL omfattar högst tio kalenderår; 1D gör inget historikanrop och visar att intradagsdata saknas. Första verkliga observationen inom perioden är basdatum: `(close / firstClose - 1) * 100`. En ensam observation ger punkt utan linje och med information om att utveckling ännu saknas.

Barens verkliga källtidsstämpel bevaras som `barTimestamp`. Den betecknas aldrig som faktisk publicerings- eller stängningstid. Hela pågående lokala dagen utesluts även efter börsstängning, tills nästa lokala dag. Detta konservativa val undviker ofärdiga dagsstaplar och gör att dagens slutkurs blir tillgänglig tidigast nästa dag. Framtida datum/tidsstämplar utesluts. Ogiltiga priser, osorterade eller dubbla datum avvisas.

Handelsfria dagar fylls inte i. Saknade slutkurser utelämnas med antal och datumintervall i UI. Grafens linjer förbinder verkliga punkter och skapar inga mellanliggande observationer. Start efter periodgränsen markeras uttryckligen; visad procent gäller basdatum till senaste observation. Full historisk kalenderkontroll över tio år saknas, därför påstår UI aldrig verifierad täckning av alla handelssessioner. Senaste slutkursdatum visas även vid försenad källa.

## API och driftsättning

`GET /api/index-history?id=OMXS30&period=1M` (eller `SP500`; period `1V`, `1M`, `3M`, `YTD`, `1Å`, `All`) går genom samma `createMarketQuoteRoutes` i Express och Supabase market-api. Klienten använder befintlig `apiFetch`, autentisering och konfigurerad bas-URL. API:t returnerar bara data efter kontroller; transportfel, HTTP-fel, felaktig identitet och saknad historik ger strukturerade felkoder. Klienten kontrollerar också kontrakt och datum. Byte av index/period avbryter förra anropet; gamla svar visas inte under det nya valet. Försök igen gör ett nytt anrop. Lokalt datumbyte för respektive marknad ger ny hämtning när dashboardens klocka uppdateras.

Backend driftsattes 2026-10-09 som market-api version 8 med fortsatt `verify_jwt = true`; daily-portfolio-snapshot är oförändrad på version 19. Alla tolv index/periodkombinationer passerade via Supabases gateway och frontendens API-klient, inklusive klientvalidering. Befintliga sex instrument samt FX, Avanza-NAV och fyra Lysa-fonder passerade också läsande produktionskontroller. Frontend publiceras genom befintligt GitHub → Vercel-flöde.

`node scripts/check-index-history.mjs --deployed` verifierar produktionsdata, fel för SIXRX/1D/ogiltig period, CORS och gatewayautentisering. Kontrollerna använder befintlig publishable key och giltig anonym JWT i minnet; inga nycklar skrivs ut och ingen service-role-åtkomst eller databas används. Supabases gateway accepterar också giltig publishable key utan explicit Bearer-header för offentliga marknadsrutter. Detta beteende jämförs med befintlig FX-route. Utan credentials och med ogiltig JWT ska anrop avvisas. RLS, autentiseringsinställningar och databasfunktioner ändras inte. Dessa kontroller verifierar inte en faktisk inloggad användarsession.

En gammal backend ger ett tydligt 404-fel med information om att market-api behöver driftsättas. Yahoo är en extern källa utan tillgänglighetsgaranti; fel ger aldrig uppskattad data. Fullständig visuell kontroll i en inloggad produktionsdashboard återstår om ingen sådan webbläsarsession är tillgänglig. Dashboarden kan automatiskt skriva historik enligt befintligt flöde, därför ska denna kontroll inte kringgå kravet på oförändrade portföljdata.

Tester täcker källvalidering, saknade och ogiltiga priser, dubbla datum, periodgränser, lokal midnatt/DST, framtida/ofärdiga staplar, Express/Supabase-routning, klientfel, renderade indexkurvor, ALL, basdatum, valuta och bibehållna portföljskydd. Kör `npm test`, `npm run lint`, `npm run build`.
