# Från grundschema till provbar stagingapp

Granskning 13 oktober 2026. Gren: `codex/verified-portfolio-pilot`, utgångspunkt
`6499c33`. Arbetskatalogen var ren. Lokala läsningar, tester, dokumentation och
en avgränsad transportseparering i importkomponenten har gjorts.
Inga molnanslutningar eller ändringar av produktion, main, användare, jobb
eller driftsättning ingår.

## Verifierad utgångspunkt och faktisk lucka

Den tidigare genomförda grundmigrationen och isolationstestet gäller endast
`vutjthqlgzokeylaxpzp`. Två Auth-konton och sex testposter städades bort;
72 skrivförsök nekades. Det är tidigare verifiering, inte en ny kontroll av
molndatabasens aktuella innehåll den 13 oktober.

Staging har tre grundtabeller, ägarstyrd läsning, revisionstrigger och läs-RPC.
Det finns ännu ingen komplett stagingapp. Den lokala demonstrationens
skriv-RPC:er, importserver, kursarkiv och historikadapter är inte installerade
där. Att ändra befintlig apps Supabase-URL till staging skulle dessutom starta
legacyflöden som förutsätter andra tabeller. Det är inte en säker aktivering.

| Del | Redan implementerat | Vad som saknas för staging |
| --- | --- | --- |
| Inloggning | Supabase Auth i båda appflödena | Separat stagingklient, egen sessionsnyckel och lösenordsinloggning för godkända syntetiska konton. `PerformanceTestApp` hämtar nu konto-lista och gemensamt lösenord från en strikt lokal demotjänst; detta får inte flyttas till en publik stagingtjänst. Ingen publik registrering eller Google OAuth behövs för första demon. |
| Import/avstämning | `LedgerCsvImport`, befintliga Avanza-/Nordnet-parser, daterade fondandelar, konto/kassa-frågor och importkvittots dubblettskydd | Stagingtransport för preview/commit, serverägt syntetiskt instrumentregister och tillåtna testfiler. Servern verifierar Auth och härleder ägare från sessionen; klienten får inte välja `user_id` eller certifiera sina egna kurser. |
| Öppningsbalans | Lokal komplett värdering inklusive valuta/kassa och start på 0 % | Atomisk stagingimport, servervalidering och sparat `ledger_state`. Grundtabellen saknar kolumnen och grund-RPC:n returnerar inte `ledgerState`; befintliga vyer kan därför inte användas direkt. |
| Affärer/kassa/GAV | `LedgerTradePanel`, `LedgerTradeForm`, `LedgerJournalTools`, lokala RPC:er och beräkningskärna | Separat stagingversion av atomiska skriv-RPC:er med revision, idempotens och rättelser. Kontrollerad användaridentitet på varje klientväg, inga direkta tabellskrivningar. RPC-namn och miljökontroll måste injiceras i befintliga komponenter/hook, inte styras av en godtycklig URL. |
| Värderingar | Oberoende worker `updatePerformanceHistory` och lokal databasadapter | Service-only stagingadapter för worker-input och atomisk publicering, cache, körstatus och källrevisioner. En manuell serverkörning räcker för första demon; schemaläggning är ett senare godkännandesteg. |
| Dashboard/graf | `Dashboard`, `LedgerDashboard`, `PortfolioSummary`, TWR/Dietz och gemensam indexstart | Stagingarbetsyta med samma komponenter och komplett läskontrakt. Bevara väntande historikbesked och lagra period/index med staging + användare som preferensscope. `LedgerDashboard` använder nu uttryckligen `local-test:`. |
| Marknadsdata | Syntetiskt daterat arkiv, arkivkärna och separata publika verifieringar | Stagingarkiv med uttryckligen syntetiska källor för första demon. Verklig komplett fond-/certifikathistorik och licenser är fortsatt en separat pilotblockerare. |
| Backup/restore | Lokal syntetisk repetition och metadataunderlag | Ny stagingrepetition med godkänt separat återläsningsmål, Auth/ägare/RLS/RPC-kontroller och privat nyckelhantering. Lokal SQL-stubb visar inte återställd molninloggning. |

## Första demonstrationens avgränsning

En separat stagingarbetsyta ska visa inloggning → syntetisk innehavsimport →
avstämning av konto/kassa → verifierad öppningsbalans → dashboard → köp,
försäljning och kapitalflöde → servervärdering → historik/index. Ingen äldre
transaktionsfil krävs. Återanvänd sex syntetiska instrument, tre konton och
fyra kassaposter från `syntheticPortfolioFixtures.mjs`, inte användarens export.

Använd ett tydligt märkt daterat demonstrationsscenario. Det befintliga lokala
kursunderlaget har fasta datum 2–9 oktober 2026 och syntetisk FX täcker som
mest 11 oktober. Det kan inte användas som kontinuerlig dagsaktuell historia.
Demo ska ha explicit värderingsdatum på servern; inga nya kurser får skapas
genom att förlänga sista värdet. Dagens registrering får visas som väntande om
fullständig dagsvärdering saknas. En datumbegränsad demo är inte bevis för
framtida automatisk insamling över verkliga handelsdagar.

Portföljpriser och portfölj-FX ska märkas syntetiska. Den befintliga
indextransporten läser OMXS30/S&P 500 via index-API och USD/SEK via
Frankfurter/ECB. För staging behövs en separat serverrutt; befintlig
produktionsfunktion får inte användas som reserv. Vid saknat index/FX visas
portföljkurvan med förklaring, utan konstruerat överlägg. Ett verkligt index
mot en syntetisk portfölj är en teknisk demonstration, inte faktisk avkastning.

SEK-jämförelse kräver samma faktiska datum och 0 %-punkt. ECB är dagsreferens
för indexvärdering, inte mäklarens avräkningskurs. USD-affärer använder antingen
avstämd USD-kassa eller faktiskt totalbelopp i SEK vid automatisk växling.
Exakt TWR förutsätter verifierade flödesvärderingar; date-only-flöden utan
sådant underlag får tydligt märkt Modified Dietz. Saknad NAV/kurs/FX får aldrig
ersättas med noll eller underliggande kryptopris. Kalendern i det syntetiska
scenariot är en testkalender, inte en verifierad verklig fondkalender.

## Implementeringsordning och nästa godkännande

Första lokala förberedelsen är klar: `LedgerCsvImport` accepterar nu en
injicerad `transport` med `fixtures()` och `request(action, files, answers)`.
Standardadaptern `localLedgerImportTransport.js` använder fortsatt endast
befintliga relativa `/api/local-test`-rutter. Den stoppar import utan session
och tillåter endast preview/commit. Ingen stagingadapter är ansluten.
Tre nya tester verifierar sessionskrav, rutter/payload och felhantering.
Avstämningsvyn och importreglerna återanvänds oförändrade.

1. **Lokalt, redan tillåtet:** extrahera befintlig arbetsyta så att klient,
   sessionshantering, importtransport, affärs-RPC:er och historiktransport kan
   injiceras. Behåll loopbackskydd och lokala RPC:er oförändrade. Separat
   staging-entry/config med exakt projektallowlist, utan fallback till legacy
   eller produktion, och avstängd PWA för att undvika gamla cachade byggen.
   Testa med injicerad transport; inget frontend-servicekonto.
2. **Lokalt, redan tillåtet:** ta fram ett separat, granskningsbart runtime-SQL
   med utgångspunkt i `performance-runtime.sql`, `history-stage.sql`,
   `cash-stage.sql` och `market-archive.sql`. Kopiera inte testfiler till molnet
   och ta inte bort deras testskydd. Första målet omfattar `ledger_state`,
   importkvitton, körstatus, privat delad cache och rättelseloggar samt
   miljöidentitet, replay, import, trade/cash/correction, worker-input,
   publicering och arkivering. Utöka läs-RPC:n med `ledgerState`.
   Service-only privilegier ska vara kvar på import/worker/arkivvägar;
   ägarpolicyer och spärrade direkta skrivningar ska bevaras.
   Exakta objektnamn, definitioner, privilegier och diff presenteras i ett
   senare SQL-underlag före begäran om migrationsgodkännande.
3. **Lokalt, redan tillåtet:** repetera just det nya utkastet ovanpå exakt
   godkänd foundation med automatic-RLS-trigger, rollback vid injicerat fel,
   två ägare, återimport, revisionskonflikt, rättelser och gamla observationer.
   Fingeravtryck på befintliga lokala legacydata före/efter. Docker måste vara
   igång för detta; det är inte utfört i denna granskning.
4. **Kräver nytt godkännande:** läsande molnpreflight och körning av exakt
   presenterad runtime-migration, endast i rätt stagingprojekt. Inga användare,
   testdata, bakgrundsjobb eller deployments inkluderas automatiskt.
5. **Kräver eget tydligt godkännandescope:** skapa två markerade syntetiska
   provkonton, kör stagingtjänsten lokalt mot staging och testa hela kedjan.
   Lösenord delas privat med ägaren, aldrig genom demokonto-API. JWT valideras
   på servern och user_id hämtas därifrån. Kör återkommande historik manuellt
   med serviceidentitet efter utloggning, inte genom aktiverat schedulerjobb.
   Testplanen anger exakta syntetiska poster, retention och städningsidentiteter.
6. **Kräver separat deploymentgodkännande:** publicera endast separat stagingapp
   och staging-API med egen origin, sekretesslagring och stängd användarlista.
   Verifiera mobilvy, omladdning, utloggning/användarbyte och avbruten import.
   Ingen production-branch eller automatisk deploykoppling. Aktivering av ett
   stagingjobb är ännu ett separat beslut efter manuellt verifierat flöde.

Återställningsstrategin inför nästa migration ska vara backup + verifierad
återläsning och avstängd stagingapp/tjänst vid fel. Transaktionsfel ska rulla
tillbaka. En lyckad migration ska inte följas av automatisk DROP eller radering
av journalen. Saknas återläsningsmål ska det redovisas, inte skapas utan tillstånd.

## Kontroller i denna körning

- `npm test`: 360/360 passerade efter transportändringen, inklusive miljöspärrar, import, journal,
  avräkning, TWR/Dietz, kursluckor/index och isolationstestets offlineharness.
- `npm run lint`: passerade.
- `npm run build` och `npm run local-test:build`: passerade. Befintlig varning
  för stor JavaScript-bundle kvarstår. Build är inte deployment.
- Docker-inspektion kunde inte ansluta till Docker Desktop Linux Engine.
  Databas-, rollback- och restore-tester har därför inte upprepats idag.
- Ingen ny manuell browser-/mobilkontroll; tidigare mobilbevis är inte en
  verifiering av en ännu obyggd stagingarbetsyta.

**Minsta säkra nästa steg:** den lokala transportsepareringen och ett separat
runtime-migrationsutkast med lokal repetition. Inget beslut krävs från ägaren
för dessa lokala förberedelser. Molnkörning får därefter begäras endast med
exakt SQL/diff, godkänd preflight och redovisade tester. Ett migrationsgodkännande
är inte ett godkännande att skapa provkonton, skriva data eller driftsätta.
