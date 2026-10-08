# Dagens förändring: felsökning och lokal rättning

## Bekräftad grundorsak

Skrivskyddad SQL-kontroll 2026-10-08 bekräftade att `holdings.previous_close` finns,
men alla befintliga innehav hade null i fältet efter uppdatering. Källtider och aktuella
priser var sparade; det var inte ett bortfall av `price_updated_at` i databasmappern.

Det offentliga Avanza-svaret för AbCellera innehöll `last`, `change`, `changePercent`
och `timeOfLast`, men inte `previousClose`. Den publicerade adaptern returnerar då
`previousClose: null`. Frontendens verifierare stoppade vid första kurs som var giltig
för värdering, även om föregående stängningskurs saknades.

Flödet var: leverantörssvar -> `getVerifiedHoldingQuote` -> App:s `updatedHolding`
med `previousClose: data.previousClose ?? null` -> `updateHoldingQuote` ->
`databaseHoldingToApp` -> ersättning av innehavsobjektet i React -> DailyMovers.
DailyMovers läser samma holdings-array hela tiden, men objekten ersätts ett efter ett.
Gamla kompletta objekt kan därför ge tillfälliga resultat; de nya ofullständiga objekten
filtreras bort. Funktionen har ingen separat slutberäkning som tömmer listan.

Därtill kontrollerade DailyMovers enbart Stockholm-datum, inte instrumentets faktiska
handelssession eller kursens ålder inom sessionen. En giltig värderingskurs från senaste
avslutade session är inte automatiskt dagens rörelse.

## Ändringar i denna rättning

- `src/services/verifiedHoldingQuote.js`: om dagens verifierade börskurs saknar komplett
  stängningskurs, fortsätt till nästa leverantör. Välj hela det kompletta svaret, inte en
  blandning av olika leverantörers fält. Om ingen ger komplett dagskurs behåll första
  verifierade värderingssvaret; det kan värdera portföljen men ska inte rankas som dagsrörelse.
  `checkedAt` kommer från den valda verifieringen, inte från avslutad fallback.
- `src/utils/dailyQuote.js`: gemensam kontroll för verifierare och rankning. Aktuell
  instrumentkalender, korrekt lokal dag, strikt kurstid, sessionsålder och positiv
  föregående stängningskurs krävs. Framtida, gamla, pre-open och långt efter stängning
  daterade priser underkänns. NAV utan daterad jämförelse och direkt krypto utan börsstängning
  rankas inte som börsens dagsrörelse.
- `src/utils/dashboardHistory.js`: använder den gemensamma dagskurskontrollen;
  ofullständig position utesluter fortfarande hela instrumentet. Historikberäkningarna ändras inte.
- `src/components/DailyMovers.jsx`: skickar faktisk observationstid, inte enbart datum.
  Design och beräknad SEK-rankning ändras inte.
- `src/hooks/useMarketStatus.js` och `src/pages/Dashboard.jsx`: uppdaterar observationsklockan
  när nya innehavsobjekt kommer, så att 30-sekunderstimern inte får nya kurser att tillfälligt
  se framtida ut. Klockan läses i effekten och renderingen förblir ren.
- `src/utils/calendarDate.js` och `src/utils/valuationFreshness.js`: flytt av befintlig
  Stockholm-datumhjälpare för att undvika cirkulära importberoenden. Historikvalideringens
  regler är oförändrade.
- `tests/marketQuotePipeline.test.mjs`: reproducerar synliga vinnare/förlorare -> null
  stängningskurs -> tom lista. Kör därefter faktisk Edge-handler, frontendverifierare och
  databasadapter med testdubbel, och kontrollerar stabila resultat under sekventiella sparanden
  samt återläsning. Inga riktiga databasskrivningar görs.
- `tests/dailyQuote.test.mjs`: fallback, ofullständiga svar, fel identitet, fel/future/äldre
  källtider, USA före öppning, stängning, helger, halvdagar, helgdagar och grupperade konton.
- `tests/dashboardHistory.test.mjs`: dagskurstester använder verklig handelsdag och marknad;
  historiktesternas datum och förväntningar är bevarade.

## Verifiering och gränser

191/191 tester passerar. Lint och produktionsbygge passerar. Befintlig byggvarning om
JavaScript-paket över 500 kB kvarstår.

Skrivskyddad kontroll av den ändrade frontendlogiken mot befintlig Edge Function passerade
för alla sex tidigare instrument. Investor B fortsatte efter Avanzas saknade stängningskurs
till ett verifierat Yahoo-svar. USA-instrumentens senaste avslutade session accepteras för
värdering men visas inte som dagens rörelse före dagens handel. NAV-fonder utan giltig
daterad jämförelse utesluts fortsatt.

Ingen deployment, databasuppdatering, schemaändring eller historikändring genomfördes.
En vanlig prisuppdatering i frontend behövs för att ersätta befintliga null-stängningskurser
med nya kompletta verifierade svar. Den faktiska webbläsarövergången är ännu inte manuellt
verifierad; regressionstestet täcker motsvarande dataflöde.
