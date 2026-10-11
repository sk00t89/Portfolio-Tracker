# Pilotförberedelse – aktuell status 11 oktober 2026

Denna rapport ersätter kvarvarande valuta-/arkivstatus i `portfolio-main-flow.md`. Arbetet gäller kod, publika marknadskällor och syntetiska portföljer i lokal testmiljö. Ingen produktionsdatabas, verklig portföljimport eller driftsättning har gjorts. Gamla transaktioner krävs inte.

## Färdigt och lokalt verifierat

### Faktisk valutaavräkning

USD-köp och försäljningar skiljer på befintlig USD-kassa och mäklarens automatiska växling. Vid automatisk växling anges avräkningsnotans faktiska totala SEK-belopp, inklusive avgifter. ECB används endast för historisk marknadsvärdering/index, aldrig som ersättning för faktisk avräkning.

Affären och växlingen skrivs atomiskt under portföljens revisionslås. Köp växlar först, försäljning växlar efter affären. USD-kassan återgår till sitt tidigare saldo vid automatisk växling; SEK-kassan ändras med exakt användarens bekräftade total. Befintlig valutakassa innebär ingen automatisk SEK-rörelse. Courtage i USD eller SEK räknas en gång. Externa insättningar hålls separata och köp/växling skapar inte externa kapitalflöden.

SEK-GAV använder den kopplade faktiska SEK-anskaffningskostnaden inklusive avgift, utan gissad FX. Native GAV är fortsatt okänt om exempelvis courtage i SEK saknar verifierad omräkning till instrumentvalutan; det hindrar inte känd SEK-kostnad. Okänd öppningskostnad förblir okänd, även efter ett köp. Delvis försäljning behåller kvarvarande GAV.

Rättelser uppdaterar affär och kopplad växling tillsammans, kräver att faktisk SEK-total bekräftas igen och bevarar båda tidigare posterna i revisionsunderlaget. Återförsök är idempotenta; fel, otillräcklig kassa eller för stor försäljning rullar tillbaka hela operationen. Två separata testanvändare och RLS är kontrollerade.

### Beständig offentlig marknadsdata

`npm run local-test:public-market` kontrollerar lokal Docker-identitet innan det hämtar enbart publika instrumentuppgifter. Arkivet ligger separat i ignorerade `supabase-test/public-market.local` och innehåller inga konton, antal, GAV eller verkliga portföljvärden. Aktuell körning verifierade:

- senaste daterade kurser/NAV för samtliga 29 instrument: sju aktier, fem fonder, sexton certifikat och TO7,
- 35 riktiga aktiestängningar över fem handelsdagar, 5–9 oktober,
- sex historiska ECB USD/SEK-observationer i den rullande återhämtningsperioden.

Aktier kontrolleras mot symbol, valuta, handelsplats och källdatum; slutlig emittentgranskning av noteringskopplingarna återstår före faktisk pilot. Fonder kontrolleras mot ISIN, andelsklass/valuta och verkligt NAV-datum. Certifikat använder den noterade produktens egna identitets- och tidskontrollerade stängningsobservationer. Underliggande kryptospot används inte. Detta arkiv är en verifieringsmiljö, inte ett aktiverat produktionsregister.

Batcher sparas atomiskt med lås och filbyte, aktuella observationer och oföränderliga källversioner/checksummor. Återinsamling behåller tidigare källdatum och skapar inga dubbletter. Kurs- och valutakorrigeringar får nya versioner. Arkivrevision kontrolleras vid publicering så att blandat underlag avvisas. Ett avbrutet filbyte lämnar tidigare kompletta arkivet; efter en abrupt processkrasch kan kvarvarande låsfil behöva kontrolleras manuellt innan återstart. Molnpiloten ska använda transaktionsbaserad delad lagring, inte denna lokala fil som produktionsdatabas.

`node scripts/localPublicMarketJob.mjs --watch` kör om insamlingen varje timme utan användarsession. Lokal dator, process och Docker måste vara igång; det ersätter inte ett driftsatt serverjobb. Den historiska femdagarsperioden är en uttrycklig verifieringsperiod. Nya stängningar/NAV samlas framåt; saknad äldre fond-/certifikathistorik tillverkas aldrig.

### Sena källor och korrekt avkastning

Historikjobbet sparar den sammanhängande kompletta delen före en lucka och stannar vid första saknade underlag. En sen NAV kan sedan komplettera rätt källdatum och körningen fortsätter utan dubbla dagar. Om en tidigare källa rättas räknas berörda revisioner om; gamla observationer behålls. Verklig feed är nu ansluten från det låsta filarkivet till den lokala tjänsteskyddade SQL-cachen och appens fiktiva `public-demo`-konton. Spegling, källrättelser och portföljrevisioner är atomiska i DB; publicering kontrollerar källrevision, hash/pris, journal, kassa och omräknad SEK-total. Staginganslutning återstår.

Exakt TWR utan externa flöden har demonstrerats med helt fiktivt antal/kassa och verkliga arkiverade aktie-/FX-kurser över fem handelsdagar. Båda verkliga indexen jämförs från samma datum och 0 %. Flöden utan nödvändiga före-/eftervärderingar visas fortsatt som Modified Dietz, tydligt märkt uppskattning.

Fondkalendrar får inte ersättas med svensk börskalender. [Avanza Zeros informationsbroschyr](https://investors.avanza.se/files/Avanza_fonder/Informationsbroschyr/informationsbroschyr_avanza-zero_2026-03-09.pdf) verifierar värdering på bankdagar och normal fördröjning för publicering. Den lokala regeln tillåter helgöverföring, men ursäktar aldrig en saknad vardags-NAV; övriga fonders regler och särskilda helgdagar är ännu inte slutgranskade. Lysa-klasser och en daterad källadapter är fortfarande ofullständiga.

ECB-kalendern skiljer TARGET-publiceringsdagar från amerikanska/svenska börsdagar för 2026–2027. Saknad förväntad vardagskurs avvisas; helgöverföring behåller verkligt källdatum. Reglerna bygger på [ECB:s publiceringsbeskrivning](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) och [TARGET-kalendern](https://www.ecb.europa.eu/ecb/contacts/working-hours/html/index.en.html). Referenskurs är inte en samtidig amerikansk stängningskurs eller brokerkurs. Indexöverlägget utelämnar fortfarande datum utan verifierad jämförbar FX.

## Kontroller och reproduktion

- `npm test`: 347 godkända enhetstester efter valuta-, arkiv-, sena NAV-, ECB-, fondkalender- och historikbeskedstilläggen.
- `npm run lint`, `npm run build`, `npm run local-test:build`: samtliga godkända den 11 oktober. Befintlig större-bundle-varning kvarstår; inget bygge driftsätts. `git diff --check` passerar.
- `npm run test:local-fx`: två nya syntetiska Auth-användare, USD-kassa respektive automatisk växling, courtage i USD/SEK, SEK-GAV, kopplad rättelse, idempotens, rollback och oförändrad legacy-hash.
- `npm run test:local-main-flow`: nuvarande innehav/fondandelar/certifikat/kassa, 0 %-ankare, utloggad tjänstevärdering, RLS, källrättelser och historiska revisioner.
- `npm run test:local-db`: godkänd fullständig omkörning den 11 oktober av atomisk journal/kassa/revision, samtidiga skribenter, negativa behörighetsprov och rollback. Uppdaterad SEK-avgiftslogik har även separata integrationsprov.
- `node scripts/testLocalImportApi.mjs`: godkänd omkörning av lokal HTTP-isolering, avvisning av verkliga filer innan skrivning, autentisering, origin och dubblettimport.
- Mobilbredd 390 × 844: automatisk mäklarväxling visar faktisk SEK-total inklusive avgifter och frågar enkelt om saknat courtage. Förhandsgranskningen avbröts utan att registrera affären. 1M och S&P 500 behölls efter intern navigation och omladdning. Äldre körfel för ofärdiga datum visas inte som aktuella luckor, och tekniska serverfel får ett begripligt besked. Skärmbild: `supabase-test/foreign-settlement-mobile.local.png`.
- `npm run test:local-public-history`: fiktiv två-enhetsportfölj med verkliga femdagarskurser/FX, beständiga versioner och båda indexen. Detta är en historisk femdagarsverifiering, inte fem separata framtida dagliga insamlingskörningar.
- `npm run test:local-public-db`: verkliga arkivkurser → lokal SQL-cache → fiktiv öppningsbalans/kassa → atomisk USD-affär → utloggad dagsvärdering → appgraf och två index. Två användare, RLS, saknade priser/FX, bekräftad Access Asien-stängning, saknad äldre certifikatkurs, källrevisioner och hel-batch-rollback passerar.
- `npm run test:local-restore`: krypterad syntetisk public/Auth-backup återställd i ny lokal databas. Elva tabellers kontrollsummor, RLS och tjänstebehörigheter matchar; originalet är oförändrat. Moln/PITR/Storage och separata klusterroller har inte återställts. Testnyckeln behålls inte.

## Fortfarande blockerande inför helportföljspilot

1. Tillförlitlig återhämtning av missade/sena fond-NAV och certifikatkurser från en verifierad historisk källa saknas för hela omfattningen. En latest-endpoint kan hoppa över ett datum om insamlingen inte körde när kursen fanns. Senaste datum får inte backfyllas som en äldre kurs. Vi behöver verifiera sådan källtäckning och villkor eller välja en licensierad källa.
2. Kvarvarande fonders och eventuella Lysa-klassers publiceringskalendrar ska granskas. TO7 kan samlas före sin bolagshändelsegräns, men lösen/förfall behöver säker hantering. Aktie-/Nordnet-mappningar ska bekräftas i serverregistret.
3. Verklig feed är lokalt kopplad till SQL-cache och fiktiva portföljer, men ska överföras till en separat granskad stagingmigration, tjänstejobb och licensierat källregister. Lokala miljöspärrar får inte avlägsnas för att aktivera molnet. Full arkivspegling har en gräns på 500 observationer; skalning kräver ett granskat sidindelat protokoll.
4. Kör flera verkliga dagliga insamlingar, lämpligen en hel handelsvecka, med syntetiska konton. Testa sena NAV, medvetet avbruten körning, retry och leverantörsrättelse. Verifierade historiska börsdagar och syntetiska fördröjningstester ersätter inte denna driftkontroll.

## Konkret staging-, backup- och återställningsplan

1. **Staging först:** separat Supabase-projekt, egna Auth-identiteter/nycklar och bara syntetiska portföljer. Dokumentera exakt project-ref/API/DB-host, origins, tjänsteroll, pilotlista och scheduler. Förväntad miljö måste matcha före varje migration/skrivning. Lokaltestskript får fortsatt aldrig ansluta till molnet.
2. **Granska additiv migration:** nya portfölj-/källtabeller och RPC:er, RLS med två användare, funktionsägare, fast search_path, EXECUTE-behörigheter och revisionslås. Inga omskrivningar av legacy-innehav/snapshots. Lokal miljöspärr får inte bara tas bort för att få produktions-RPC.
3. **Backup före godkänd produktion:** identifiera faktisk backup/PITR-kapacitet, säker export av schema/data och separat hantering av Auth/Storage. Spara projektref, tidpunkt, objekträkning och kontrollsummor utan portföljrader/hemligheter i loggar. Kryptera export och begränsa åtkomst/retention. Ingen produktionsbackup har tagits här.
4. **Full restore:** börja med syntetisk stagingbackup i en separat restore-miljö. Kontrollera FK, roller, RLS, ägare, journal, kassa, importkvitton, revisionshistorik, källarkiv och att scheduler inte råkar starta där. Kör samma handräknade retur-/GAV-prov efter restore. RPC-rollback är inte detta restore-prov.
5. **Acceptans:** en handelsveckas källinsamling, känt första öppningsvärde, dubbletter, backdaterad valutaaffär, rättad SEK-avräkning, kapitalflöden, NAV-/FX-rättelse och bortfall. Saknade underlag ska ge vänteläge med senaste kompletta datum. Kontrollera oförändrad legacy-hash och att service key saknas i frontend.
6. **Separat godkännande:** presentera exakt migration, källmatris, drift-/restore-bevis, kostnad/villkor, pilotkonto och startdatum. Pilotlistan är tom tills du godkänner produktionsändring och verklig import. Första öppningsbalansen granskas inklusive kassa; inga gamla transaktioner behövs.
7. **Begränsad aktivering:** efter godkännande, backup och migration körs skuggberäkning för en användare före grafaktivering. Övervaka källdatum, luckor och revisionskonflikter. Kill switch stänger nya journalskrivningar/publicering och återgår till legacy-vyn utan att radera journalen. Destruktiv återställning som förlorar senare affärer kräver ett nytt beslut.

Inget nytt användarbeslut behövs för fortsatta lokala verifieringar. Inför staging behövs separat godkännande för exakt miljö och eventuell betald datakälla; inför verklig start bekräftas kontoomfattning, första daterade innehavs-/kassabesked och avräkningssätt. Helportföljspiloten är inte redo innan blockerarna ovan är lösta.
