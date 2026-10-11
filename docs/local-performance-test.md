# Isolerat lokalt portföljtest – 10 oktober 2026

Endast godkänd lokal testmiljö. Ingen produktionsmigration, deployment, aktivering eller kopiering av verkliga portföljer. Alla innehav, affärer, kassa och portföljpriser är syntetiska. Indexdata är verkliga publika historiska observationer.

## Identitet och spärrar

Supabase-projektet heter `portfolio-performance-local-test`. API: `http://127.0.0.1:55321`, PostgreSQL-port: `55322`, Studio: `55323`. SQL körs bara med `docker exec` mot `supabase_db_portfolio-performance-local-test` efter kontroll av containeridentitet, körstatus och publicerad port. Testkatalogen får inte innehålla ett länkat fjärrprojekt. Klient och server accepterar endast den exakta lokala API-adressen. RPC-skrivningar kräver dessutom databasmarkören `portfolio_tracker.test_only=true`; klienten kontrollerar testmiljöns RPC-identitet före skrivningar.

Huvudprojektets `.env.local` används inte. Testbygget har egen rot och egen ignorerad `.env.local`, med lokal publik anon-nyckel. Service-nyckeln hämtas till testserverns minne från status för just den lokala stacken och exponeras inte för klienten. Två Auth-användare med `.invalid`-adresser och syntetiska inloggningar finns i en ignorerad lokal fil. Testservern binds till loopback och värderar endast dessa användare.

## Start och kontroll

Kör från projektroten. Docker måste vara igång. Kommandona nedan använder uttryckligen den separata testkatalogen; kör aldrig ett remote/link/push-kommando för detta test.

```powershell
npx --yes supabase start --workdir supabase-test --exclude 'realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor'
npm run local-test:setup
npm run test:local-db
```

Starta API och gränssnitt i två terminaler:

```powershell
npm run local-test:api
npm run local-test:ui
```

Öppna `http://127.0.0.1:55800`. Välj Alice eller Bob. Knappen för omräkning skapar färdigställda observationer från öppningsbalans och journal med explicit syntetisk kurskälla. Återkörning för samma revision hoppar över redan sparade datum. En journaländring ger ny revision; gamla observationer behålls men lämnas ut först när den nya revisionen har värderats. Vid samtidiga ändringar avvisas hela publiceringsbatchen.

```powershell
node scripts/checkLocalPerformanceGraph.mjs
npm test
npm run lint
npm run build
npm run local-test:build
```

`test:local-db` skapar nya syntetiska användare och en ny demo-användarlista varje gång; gamla testidentiteter och tidigare revisionsrader behålls. En redan inloggad webbläsare ska då välja en användare från den nya listan. Teststacken kan stoppas utan produktionspåverkan med `npx --yes supabase stop --workdir supabase-test`.

## Vad fungerar

- Första import till separat öppningsbalans inklusive kontoinnehav, daterade testpriser och uttrycklig kassa. Startvärdet räknas på servern; samma användare kan inte skriva över importen.
- Köp/sälj med antal, pris, datum, känd avgift och finansieringsval. Granskning föregår lagring. Köp med nya pengar kräver faktisk separat insättning; inga insättningar härleds från köpeskillingen. Försäljningslikvid stannar i kassan.
- Journal, härledd kassa/innehav och revision sparas atomiskt. Historiska affärer återspelar hela följande journalen. Låsning och förväntad revision förhindrar förlorade samtidiga ändringar. Stabilt request-id ger idempotenta retries; ändrad payload avvisas.
- RLS och RPC-behörigheter för minst två användare: andra användarens tre tabeller är oläsbara, direkta autentiserade skrivningar och anonyma anrop avvisas, observationspublicering kräver serverroll.
- Rollback efter att en extern insättning redan lagts in: otillräcklig kassa i köpet återställer hela transaktionen. Okänd avgift, överförsäljning, fel valuta och ogiltigt datum lämnar journal/kassa/revision oförändrade. Delvis felaktig observationsbatch skriver inga rader.
- Omräkning är serverstyrd och gäller endast färdigställda datum. Gamla revisioner behålls. Syntetiska sentinel-rader i kopior av gamla holdings/snapshot-tabeller är hash-identiska före/efter testet. En separat autentiserad session ser samma journal utan localStorage.
- Verkliga OMXS30- och S&P 500-historikkurser har validerats via Yahoo-indexidentitet, valuta, tidszon, datum och numeriska slutkurser. S&P 500 räknas om med historisk USD/SEK från en explicit ECB-källa via Frankfurter; utökad provider-metadata kontrolleras mot faktisk kurs/datum. ECB är en dagsreferens och inte FX vid USA-börsens stängningsögonblick. [Källans API-dokumentation](https://frankfurter.dev/).
- Grafen väljer gemensamma faktiska datum och nollställer båda serierna på samma startpunkt. Den 10 oktober verifierades båda indexöverläggen 5–9 oktober för båda användarna. Saknade dagar fylls inte. Kortare underlag redovisas. Prisindexets avsaknad av utdelningar anges; skillnaden presenteras inte som exakt överavkastning.
- Testad webbläsarkedja: lokal inloggning, journalregistrerat köp, automatisk omräkning, OMXS30 och S&P 500 i grafen. 1M och indexval behålls vid intern navigering och siduppdatering. Dashboarden har en innehavsöversikt.

## Begränsningar och fortsatt ordning

1. Testimportknappen och kursgeneratorn stöder enbart den syntetiska SEK-testaktien. Det är inte en färdig import av verkliga broker-CSV-filer eller en produktionsvärderingsworker. CSV-avstämning behöver stabila konto/instrument/affärsreferenser, faktisk kassa, historiska priser/NAV/FX, avgifter och fullständigt kontoskop. Automatisk serverkörning när användaren är utloggad återstår; lokal omräkning körs på begäran och efter en sparad affär.
2. Beräkningsmotorn stöder exakt TWR när värderingar före/efter varje externt kapitalflöde är verifierade. Bob, som saknar externa flöden, testas med exakt TWR. Alice har en uttrycklig dagslutsschablon för insättningen och måste visas som **uppskattad daglig Modified Dietz**. Den lokala journal-RPC:n certifierar inte före/efter-värden för externa flöden. Nästa steg är servervärdering vid faktiska flödestidpunkter och ett test av hela denna TWR-kedja. Modified Dietz får aldrig marknadsföras som exakt TWR.
3. Ren import av journalens fler händelsetyper (uttag, utdelning, ränta, kontoöverföring, växling) och korrigerings-/reverseringsflöden behöver egna säkra skrivrutiner och gränssnitt. Replaymotorn hanterar huvudtyperna, men köp/sälj-RPC:n är avsiktligt smal. Splitar, värdepappersöverföringar och lån kräver utökad modell innan sådana konton godkänns.
4. Historik före 4 oktober kan bara byggas från verifierad äldre öppningsbalans och fullständig faktisk journal med historiska priser och FX. Nuvarande innehav, GAV och total-snapshots räcker inte. Ingen äldre användarhistorik har skapats eller påståtts vara verifierad.
5. Produktionspaketering, varaktig gemensam marknadscache, brokerimport, bakgrundsjobb, verklig datacertifiering och frontendaktivering återstår. Allt som ändrar produktion eller driftsätter kräver nytt uttryckligt godkännande. Den ordinarie appens performance-flagga är fortsatt avstängd som standard.

Kontrollresultat efter appintegrationen: SQL körd i lokal PostgreSQL/Supabase; RLS/journal/rollback och faktisk index-/FX-kedja har körts om och passerar. 307 enhetstester, lint och båda byggen passerar. Byggena har kvar varning för JavaScript-chunk över 500 kB. En lokal verifieringsbild ligger i ignorerade `supabase-test/graph-proof.local.jpg`.

## Integration i befintliga appen

Det separata testbygget laddar nu samma `App.jsx` och router som appen. Ett uttryckligt lokalt läge väljer journalarbetsytan, som återanvänder Navbar, Innehav, Import-sida, översiktskort och indexgraf med befintlig CSS. Läget är avstängt som standard och vägrar andra ursprung än `http://127.0.0.1:55800` samt andra Supabase-adresser än den isolerade lokala miljön. Testmodulen laddas separat. Den ordinarie appens gamla dataladdning och skrivvägar startas inte i journaltestläget.

Innehav-sidans befintliga Köp/Sälj-knapp öppnar `LedgerTradePanel`. Granskningen ogiltigförklaras när fält ändras. Registrering använder serverjournalen i stället för localStorage. Direkt borttagning är spärrad för journalförda innehav. Kända avgifter krävs; saknad historisk FX ger ingen antagen konvertering. GAV visas som saknat om importen saknar det; öppningspriset används aldrig som inköpspris.

`useLedgerPortfolio` samordnar läsning, registrering och historikomräkning. Vid sparad affär används den nya revisionen och gammal avkastningshistorik tas omedelbart bort från grafunderlaget. Sparade publika priser kan fortsätta vara tydligt inaktuella visningsdata för innehav. Bakgrundsläsningar som startade före en omladdning får inte återställa gammal historik. Sparad affär med misslyckad omräkning rapporteras som sparad med separat historikvarning, så användaren inte registrerar samma affär på nytt. Ett kvarvarande request-id ger säkert återförsök vid oklart nätverksutfall. Portföljen läses också om vid fönsterfokus och var 60:e sekund.

Den integrerade webbläsarkontrollen omfattar syntetisk försäljning från Innehav, ändrad förhandsgranskning, ny kassa/antal/revision och återgång till grafen. RLS och transaktionsrollback ligger kvar på servern. Ljust/mörkt tema och navigation använder befintliga appkomponenter. Verklig CSV-import, fullt servercertifierad TWR vid externa flöden, fler journalskrivtyper och bakgrundsvärdering återstår enligt listan ovan. Detta är en lokal integrationsetapp och inte en aktivering för verkliga användare.
