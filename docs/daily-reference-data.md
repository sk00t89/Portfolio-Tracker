# Daterat underlag för dagsförändring

Frankfurter levererar dagliga referensvalutakurser. `reference-fx` returnerar validerade objekt med valutapar, kurs, verkligt `sourceDate`, `sourceTimestamp: null`, separat `checkedAt` och daterade observationer. Ingen intradagstid uppfinns. Frontend ignorerar gamla numeriska cacheposter, deduplicerar förfrågningar och kontrollerar objektens ålder. Det numeriska `getExchangeRate`-gränssnittet finns kvar för befintlig pris-/visningsomräkning men läser det verifierade objektet.

Avanzas NAV-adapter verifierar ISIN, fondens detaljsvar och att senaste värde/datum matchar den daterade fondgrafen. Lysa använder `api.lysafonder.se/public/nav/latest` och `/public/nav/YYYY-MM-DD`; den senare är ett as-of-svar och kan returnera fredagens verkliga NAV-datum på helgen. Misslyckade anrop behandlas aldrig som en dag utan publicering. Föregående NAV hämtas ur verkliga observationer, aldrig ur procentfält eller importerade affärspriser.

Jämförelser finns endast i kursbatchens användarbundna kontrollstate. De skrivs inte till innehav eller snapshots. NAV-fel blockerar jämförelsen, inte en i övrigt verifierad värderingskurs. React publicerar jämförelser och färdiga kursresultat atomiskt. Ändrad position eller användare får inte återanvända föregående jämförelse.

Instrumenttäckning mäter färska värderingskurser, inklusive senast publicerade NAV. SEK-dagstäckning kräver även föregående jämförelsepris, exakt relevanta datum för FX/NAV och korrekt listingkalender. Fonder med NAV från igår får sin daterade senaste NAV-rörelse men inte en påstådd rörelse för idag. Börshandlade kryptocertifikat använder sin börskurs i noteringsvalutan; direkt krypto saknar ännu verifierad kalenderdagsjämförelse.

För oförändrat antal och inga relevanta affärer/flöden används `sum(q * P_current * FX_current) - sum(q * P_previous * FX_previous)`, med tidigare jämförelsevärde som procentbas. Det är referensvalutavärderad förändring, inte intradag-FX. Sparat SEK-värde kan använda en äldre referenskurs och ersätts inte av beräkningen. Ofullständigt underlag, affärer/flöden under jämförelseintervallet eller blandade jämförelsedagar blockerar totalen. Ingen partiell siffra presenteras som hela portföljens avkastning.

Förberedelse för nyckeltal: dagsmodellen väljer aktuell öppen eller senaste avslutade session per marknad och är oberoende av grafperiod. Blandade kalenderdagar kan inte summeras som en gemensam dagsavkastning. Nyckeltalens befintliga placering är oförändrad. Index och TWR ligger utanför ändringen.

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
