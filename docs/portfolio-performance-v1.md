# Första versionen av kassaflödesjusterad portföljgraf

Status 10 oktober 2026: schema och journal-RPC är nu körda och integrationstestade i en separat lokal Supabase med två syntetiska användare. Ett separat testgränssnitt kopplar import, köp/sälj, kassa, revisionsstyrd omräkning och graf till lokal lagring. Båda verkliga indexen och historisk ECB-valuta har verifierats genom publika anrop. Se [lokal testmiljö och resultat](local-performance-test.md). Aktivering i produktion återstår och kräver nytt godkännande. Ingen befintlig produktionsdata har ändrats.

Detta uppdrag ersätter auditens tidigare förslag om att rekonstruera historik före första verifierade importen. Målet är nu att följa portföljen från en verifierad öppningsbalans. GAV påverkar inte avkastningsindexet.

## Datamodell att godkänna

Granskningsbart SQL: [portfolio-performance-v1.sql](../supabase/proposals/portfolio-performance-v1.sql), med uttryckligt lokalt tillägg [performance-runtime.sql](../supabase-test/performance-runtime.sql). Förslaget ligger utanför produktionsmigrationskatalogen och har endast körts i den godkända lokala testdatabasen. Det skapar tre separata tabeller och en läsande RPC; inga produktionsimporter, backfills eller cron-aktiveringar har gjorts. Runtime-tillägget lägger härledd kassa/innehav på den nya baseline-tabellen och lokalt spärrade skrivrutiner. PostgreSQL har validerat och exekverat schemat, och behörigheter/rollback har testats via lokal Supabase REST med två Auth-identiteter.

| Ny tabell | Minsta underlag | Syfte |
| --- | --- | --- |
| portfolio_performance_baselines | user_id, revision, verifierad baseline-JSON, flödes-/kostnadstäckning, konvention | En uttryckligen avstämd öppningsbalans; aldrig skapad automatiskt för gamla konton |
| portfolio_ledger_events | ägare, stabilt event-id, faktiskt affärsdatum, ordning, konto, källa, extern referens, event-JSON | Gemensam journal över affärer, kassa, externa flöden och kostnader mellan enheter |
| portfolio_performance_observations | ägare, värderingsdatum, journalrevision, observation-JSON | Separata färdigställda beräkningsvärden; tidigare revisionsversioner behålls |

Baseline-JSON innehåller `date`, faktisk `asOf`, `valueSek`, `positions` (konto, stabilt instrument-id, valuta, antal), `cash` (konto, valuta, belopp inklusive bekräftad nollkassa), källreferens, komplett täckning och om värdet är en färdigställd dagsvärdering. Kontoskopet måste avstämmas mot importen; innehav från ett konto utan verifierad kassa får inte ge en totalportföljjämförelse. Marknadsvärdet ska verifieras mot daterade priser/NAV/FX eller ett komplett daterat kontoutdrag. Vinster före detta datum ingår inte.

Event-JSON innehåller `kind`, belopp i faktisk valuta, antal/instrument vid affär, explicit avgift och avgiftsvaluta, eventuell faktisk flödestid, historisk SEK-kurs för externa flöden och källspårning. Köpeskilling är antal × pris; avgiften ligger separat. Nya externa pengar registreras som en separat verifierad insättning, aldrig genom att kalla köpet ett kapitalflöde. Försäljningslikvid ligger kvar i kassan tills ett faktiskt uttag registreras. Interna överföringar och FX-växling har två ben. Utdelningar, ränta och avgifter påverkar avkastning. Värdepappersöverföringar, splitar, lån/negativ kassa och andra ännu ostödda händelser behöver egna journaltyper innan sådana konton kan certifieras; de ska inte döljas som insättningar eller köp.

Observation-JSON innehåller totalt SEK-värde inklusive kassa, faktisk värderingstid, fullständighet, källspårning för priser/FX och journalrevision. Okända flöden eller avgifter blockerar fullständighet. RLS medger bara läsning av egna rader. Frontend kan inte själv sätta `verified` genom att skriva JSON: förslaget ger inga direkta autentiserade skrivbehörigheter. Den framtida journal-RPC:n ska validera dokumenterade användaruppgifter, avgifter och finansiering och uppdatera journal, kassa och revision atomiskt. Serverns service-roll får aldrig exponeras i klienten.

Journaländringar ogiltigförklarar flödes-/kostnadstäckningen och ökar revisionen. Den läsande RPC:n hämtar baseline, journal och samma revisions dagsvärderingar i en gemensam MVCC-vy. Gamla härledda rader ligger kvar. En ny avstämning och omräkning behövs innan graferna kan använda den nya revisionen; det får inte ske genom att märka gamla värden som omräknade utan verifiering. SQL-förslaget implementerar denna spärr, men ännu ingen skrivrutin som återcertifierar underlaget.

## Etablerad metod och begränsningar

Metodvalet följer [CFA Institutes GIPS Handbook, beräkningsmetodik](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/). Detta är en metodreferens, inte ett påstående om GIPS-certifiering av appen.

- Exakt TWR: länka avkastningen mellan externa flöden geometriskt. Kräver verifierade värden direkt före och efter varje flöde. Utan flöden är förhållandet mellan två verifierade totalvärden den exakta delperiodavkastningen.
- När flödesvärderingar saknas: Modified Dietz per dagsintervall, geometriskt länkad. `r = (slutvärde − startvärde − nettokassaflöde) / (startvärde + tidsvägda kassaflöden)`. Faktiska tidpunkter används när de finns. Saknas de får bara en uttryckligt registrerad policy `end_of_day_assumption` användas: flödet antas vid dagens slut, med vikt 0. Ingen påhittad faktisk tidsstämpel sparas. UI märker hela den berörda serien som uppskattad om något intervall använder denna metod.
- Stora flöden och volatilitet kan ge betydande fel i uppskattningen. Saknas även belopp/täckning eller godkänd tidskonvention blir resultatet otillräckligt underlag, inte nollavkastning.
- Noll/negativ kapitalbas, total kapitalförlust eller luckor i dagsvärderingarna blockerar den nuvarande avkastningskedjan. Negativ kassa/marginalkonton stöds inte i första versionen.

Motorerna är rena funktioner; de gör inga databas- eller localStorage-skrivningar. `performanceLedger.js` spelar om innehav och kassa vid faktiskt affärsdatum. `portfolioPerformance.js` beräknar avkastning. `performanceObservation.js` kan beräkna en separat färdigställd observation efter verifierad journal-/kostnadstäckning. En historisk affär ändrar replay från affärsdatumet; den ändrar aldrig en befintlig snapshot genom dessa funktioner.

## Daglig konvention och index

`stockholm_end_of_day_v1`: avstämning tidigast 23:30 Europe/Stockholm; en observation räknas som färdigställd först nästa lokala dag. Svenska och amerikanska instrument använder sina verkliga relevanta stängningar. Fond-NAV och handelsfria dagar får använda senast publicerat värde endast med explicit kalenderverifierad carry-policy, högst sju dagar, och oförändrat verkligt källdatum. Okänd kalender eller otillgänglig kurs är ett fel. Denna konvention är en dagsjämförelse med olika underliggande kurs-/referenstider, inte en samtidig global marknadsvärdering.

CSV-import mitt på dagen kan etablera portföljens initiala värde och 0 %-bas men är inte samma dags indexstängning. Indexjämförelsen startar då vid den första senare gemensamma färdigställda dagsvärderingen. Avkastningsmotor och jämförelsegraf har därför separata baser som måste visas tydligt vid aktiverad onboarding. Affärer på själva öppningsdagen kräver först avstämning: den nuvarande dagliga replay-modellen kan inte avgöra om de redan ingår i importen och blockerar dem. En mer detaljerad intradagsbas är ett senare steg.

Index hämtas genom befintlig Yahoo-adapter. Ny endpoint `/api/index-fx-history?start=YYYY-MM-DD&end=YYYY-MM-DD` hämtar historisk USD/SEK via [Frankfurter med uttryckligt ECB-filter](https://frankfurter.dev/). Källa, riktning, datum och provider kontrolleras. ECB:s dagsreferens är inte en samtidig USA-stängningskurs. S&P-beräkningen är `(indexnivå_USD × SEK_per_USD)`, därefter normalisering från samma datum som portföljen. Saknas FX för ett indexdatum utelämnas det och redovisas; ingen aktuell kurs eller implicit helgfyllnad ersätter det. Endpointen är ny lokal kod och finns inte i produktion genom detta arbete.

OMXS30 och S&P 500 används som prisindex utan utdelningar. Portföljen mäts inklusive utdelningar och faktisk kostnadspåverkan. Grafen upplyser om skillnaden och redovisar inte en sådan differens som överavkastning i procentenheter. Verifierade totalavkastningsindex kan anslutas senare om licens/källa finns.

Perioden väljer verkliga färdigställda observationer inom intervallet. Jämförelsen använder gemensamma faktiska datum och normaliserar båda serierna till 0 % vid den gemensamma startpunkten. Denna punkt filtreras inte bort. Kort historik visas med faktiska start/slut och uttrycklig begränsning; den påstås inte motsvara en hel månad eller ett helt år. Handelssessioner/FX-datum som saknas anges. Grafens linjer förbinder verkliga punkter utan att skapa observationer. Livevärdet visas separat ovanför och kan inte blockera eller förlänga den färdigställda jämförelsen.

Index och index-FX har begränsad cache och deduplicering mellan användares anrop i samma serverinstans. Detta är inte en beständig global marknadscache mellan Edge-instanser. En gemensam serverhämtning och beständig cache för instrumentkurser/NAV/FX ska utformas i nästa worker-steg innan många användare aktiveras; den kan behöva en separat godkänd marknadstabell.

## Automatisk historik och nästa implementation

Befintlig arkitektur innehåller `daily-portfolio-snapshot`, Vault/pg_net och en cron-definition med Stockholm-fönster från 23:30. Arbetsprocessen stöder revisioner, källmetadata, dry-run och fortsättning över användare. Detta är en lämplig grund för bakgrundskörning även när användaren är utloggad. Aktuell produktionskonfiguration/cron-status har inte lästs eller ändrats här. Den befintliga workern värderar dagens innehav och ersätter dagens total-snapshot; den ska inte användas som transaktionsjournal eller återdatera historiska innehav.

Föreslagen fortsättning efter schemagodkännande:

1. Validera SQL i en isolerad Supabase-miljö, kontrollera RLS med två användare, obehöriga skrivningar, revisionsspärr och en atomisk journal-RPC.
2. Anslut onboarding/import till separat öppningsbalans inklusive kassa och dokumenterad källa. Befintliga användare får en explicit avstämning. Oktobers servermetadata/kontoutdrag kan hjälpa, men tidigare total-snapshots får inte ensamma certifiera flöden, kassa eller historiska vikter. Ingen automatisk startpunkt eller backfill.
3. Ersätt den gamla localStorage-affärsregistreringen med journal-RPC:n. Det förberedda `LedgerTradeForm` använder antal, pris och affärsdatum förvalt till idag; konto/valuta hämtas från positionen. Avgift under Avancerat får vara okänd som utkast, men måste bekräftas eller hämtas från verifierad affär innan certifiering. `prepareLedgerTradeDraft` hanterar kontrakt och finansieringsval. Formuläret är ännu inte anslutet till det gamla transaktionsflödet; det skickar bara ett overifierat utkast till en granskningscallback. Ingen aktuell FX får ersätta historisk FX i registreringen.
4. Stäm av CSV mot stabila affärsreferenser. Samma referens dubbelräknas inte. Saknad referens eller liknande affärer ska ge avstämningsbehov, inte automatisk sammanslagning. Redan registrerade affärer på/before öppningsdagen kräver uttrycklig avstämning.
5. Anslut ny servervärdering till separata observationsrader och gemensam marknadsdata. Hämta faktisk historisk kurs/NAV/FX vid omräkning. Osäker datatäckning blockerar certifieringen. Behåll gamla derived revisions och befintliga snapshots.
6. Kör read-only/dry-run-kontroller mot faktisk användardata. Därefter separat godkännande för marknads-API/worker-deployment, cron-aktivering och frontendaktivering. `VITE_PORTFOLIO_PERFORMANCE_READ_ENABLED` är avstängd som standard; endast efter godkänd serverinstallation får den aktiveras. Läsadaptern gör inga RPC-anrop dessförinnan.

## Utförda kontroller

Efter lokal appintegration: `npm test` passerade 307/307 tester, `npm run lint`, ordinarie bygge och lokalt testbygge passerade. RLS/journal/rollback samt båda faktiska indexöverläggen har också körts om lokalt. Byggena har varning för en JavaScript-chunk över 500 kB. `git diff --check` passerade för spårade ändringar.

Regressionstester täcker interna köp/sälj, insättningar/uttag, kassa, utdelning/ränta, avgifter, faktisk växling, återspelning av historiska affärer, importdubbletter, saknad avgift/kassa/pris/FX, exakt TWR, Modified Dietz, explicit datumantagande, revisionsluckor, gemensam baspunkt, olika handelsdagar, live-separering och renderad procentgraf. Modified Dietz jämförs med GIPS-handbokens räkneexempel. Testsiffrorna är testfixtures, inte användarhistorik.

Efter lokalt miljögodkännande har publika Yahoo-index och Frankfurter/ECB verifierats live. Det faktiska utökade ECB-providerobjektet kontrolleras nu mot kursens datum och värde. Lokal PostgreSQL-exekvering, tvåanvändar-RLS, separat autentiserad session och visuell lokal grafkontroll har genomförts. Ingen produktionskontroll, deployment eller produktionsdataändring har gjorts. Tidigare implementeringsordning ovan avser fortfarande produktionsarbetet; den lokala prototypen har en avsiktligt begränsad syntetisk import och testkursgenerator.
