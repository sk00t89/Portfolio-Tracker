# Daterat underlag för dagsförändring

Frankfurter levererar dagliga referensvalutakurser. `reference-fx` returnerar validerade objekt med valutapar, kurs, verkligt `sourceDate`, `sourceTimestamp: null`, separat `checkedAt` och daterade observationer. Ingen intradagstid uppfinns. Frontend ignorerar gamla numeriska cacheposter, deduplicerar förfrågningar och kontrollerar objektens ålder. Det numeriska `getExchangeRate`-gränssnittet finns kvar för befintlig pris-/visningsomräkning men läser det verifierade objektet.

Avanzas NAV-adapter verifierar ISIN, fondens detaljsvar och att senaste värde/datum matchar den daterade fondgrafen. Lysa använder `api.lysafonder.se/public/nav/latest` och `/public/nav/YYYY-MM-DD`; den senare är ett as-of-svar och kan returnera fredagens verkliga NAV-datum på helgen. Misslyckade anrop behandlas aldrig som en dag utan publicering. Föregående NAV hämtas ur verkliga observationer, aldrig ur procentfält eller importerade affärspriser.

Jämförelser hämtas separat av dashboardens användarbundna, skrivskyddade referensläsare. De skrivs inte till innehav eller snapshots och kurssparandet väntar inte på dem. Lysa-prishämtningen väntar inte heller på NAV-par. NAV-fel blockerar jämförelsen, inte en i övrigt verifierad värderingskurs. Aktuellt NAV måste fortfarande matcha innehavets verkliga värde och datum; användarbyte får inte återanvända annan användares jämförelsestate.

Instrumenttäckning mäter färska värderingskurser, inklusive senast publicerade NAV. SEK-dagstäckning kräver även föregående jämförelsepris, exakt relevanta datum för FX/NAV och korrekt listingkalender. Fonder med NAV från igår får sin daterade senaste NAV-rörelse men inte en påstådd rörelse för idag. Börshandlade kryptocertifikat använder sin börskurs i noteringsvalutan; direkt krypto saknar ännu verifierad kalenderdagsjämförelse.

För oförändrat antal och inga relevanta affärer/flöden används `sum(q * P_current * FX_current) - sum(q * P_previous * FX_previous)`, med tidigare jämförelsevärde som procentbas. Det är referensvalutavärderad förändring, inte intradag-FX. Sparat SEK-värde kan använda en äldre referenskurs och ersätts inte av beräkningen. Ofullständigt underlag, affärer/flöden under jämförelseintervallet eller blandade jämförelsedagar blockerar totalen. Ingen partiell siffra presenteras som hela portföljens avkastning.

Nyckeltalen visas i ordningen IDAG (SEK och procent), vald periods värdeförändring, kapitalförändring. IDAG är oberoende av grafperiod, index och visningsvaluta och avser Stockholms kalenderdatum. Innan respektive börs öppnar visas tidigare session separat med verkliga jämförelsedatum. Fond-NAV visas alltid separat med publicerade värderingsdatum. Olika jämförelsepar hålls i egna delmängder; bara ett verkligt komplett och gemensamt dagsunderlag kan visa hela portföljens IDAG.

Referensobservationers giltighet avgörs av identitet, källdatum, kontrolltid som inte ligger i framtiden och matchande jämförelsedagar, inte av 20-minutersgränsen för värderingskontroller. Befintliga skydd för aktuell kurs, kassaflöden och exakt daterad FX kvarstår. En misslyckad ny hämtning behåller tidigare verifierade observationer, men dessa måste fortfarande passa den faktiska jämförelsen; datum eller kontrolltid ändras aldrig för att göra dem färska.

Referensläsaren kontrollerar datum och sessionsstatus var 30:e sekund medan fliken är synlig samt vid `visibilitychange`. Datum-/sessionsbyte eller nytt innehavs-NAV utlöser relevant hämtning; annars återanvänds FX-cache i 10 minuter och NAV-cache i 15 minuter. Transportfel återkontrolleras efter två minuter. Identiska valuta- och fondförfrågningar dedupliceras; Lysa använder en gemensam bulkförfrågan. Detta uppdaterar endast jämförelseunderlaget, inte innehavets sparade kurs. Diagnostiken visar källa, kurs- och jämförelsedatum, verklig källkontroll, senaste hämtningsförsök, referensgiltighet och exkluderingsorsaker.

Officiell, separat verifierad föregående stängning, direkt kryptos dygnsbas och förbättrad FX-källa återstår till nästa arbetssteg. Befintligt `previousClose`-underlag behålls och dess avsaknad av separat datumverifiering visas. Den här ändringen kräver endast frontenddeployment; befintlig Express/Supabase-arkitektur och samtliga backendfunktioner behålls.

## Verifiering och publicering

`npm test`, `npm run lint`, `npm run build` och `node scripts/check-daily-reference.mjs`.
För alla fem sparade Avanza-fonder: tillägg `--holdings-file diagnosis.local/holdings.json` (privat, ignorerat underlag).
För publicerad Edge Function: tillägg `--deployed`. Röktesten använder endast GET, inga databasoperationer.

Backend behåller `market-quotes-v2` och lägger till `daily-reference-v1`; gamla frontendrutter fungerar fortsatt. Publicera endast `market-api` före frontend. Ingen SQL, migration eller snapshotfunktion ska publiceras. Ta först en återställningskopia av aktiv Edge Function med `supabase functions download ... --use-api --workdir deployment-backups.local/before-daily-reference`. Kontrollera röktest i drift innan GitHub→Vercel Production uppdateras.

Återställning: återpublicera nedladdad `market-api` från backupkatalogen och återställ Vercels tidigare deployment. Ingen produktionsdata behöver återställas. Kopian behåller JWT-verifiering. Deployment innebär inga direkta dataändringar; inloggad app behåller sitt befintliga normala pris-/snapshotflöde.

Kvarstående dataluckor: dagens NAV tills det faktiskt publiceras, verifierad intradag-FX, gemensam värderingspunkt vid blandade handelskalendrar, komplett affärs-/kontant-/flödesunderlag samt direkt kryptos kalenderdagsbas. Dessa luckor ska fortsätta visas och blockera totalen.

## Verifierat 8 oktober 2026

231 tester, lint och produktionsbuild passerade. Byggets befintliga varning om JavaScript över 500 kB kvarstår.
`market-api` version 7 är aktiv, JWT-verifiering på, befintligt kurskontrakt `market-quotes-v2` och nytt referenskontrakt `daily-reference-v1`.
Driftsatta GET-kontroller verifierade USD/SEK för 7 och 8 oktober, samt verkliga NAV för 6 och 7 oktober för samtliga fem Avanza-fonder och fyra Lysa-fonder.
Tidigare sex instrument, CORS och ogiltig Yahoo-symbol passerade också. `daily-portfolio-snapshot` är oförändrad på version 19.
Återställningskopian före ändringen innehåller aktiv version 6 och samtliga importer samt funktionskonfiguration.
Inloggad användarsession och faktisk helportfölj efter användarens nästa atomiska uppdatering är inte verifierade av GET-röktesten.
