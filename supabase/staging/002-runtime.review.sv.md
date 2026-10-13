# Runtime för syntetisk staging – granskningsunderlag

13 oktober 2026. Endast lokala förberedelser; inget nytt molngodkännande finns.
Exakt körbart granskningsutkast: [002-runtime.approval.sql](002-runtime.approval.sql).
Det ligger utanför automatiska migrationer. Kör inte `supabase db push`.
SHA-256 för SQL med LF-normaliserade radslut:
`8b81188f3056ce1fee33444b95762ec7b2d0cf9696862c05ef473c743cd6f35b`.

## Exakta ändringar

- Lägg till `ledger_state jsonb NOT NULL` i `portfolio_performance_baselines`.
- Skapa fem tabeller: `staging_runtime_environment`,
  `staging_performance_imports`, `staging_performance_runs`,
  `staging_performance_market_cache`, `staging_performance_corrections`.
  Alla har RLS. Importkvitton, körstatus och rättelser har ägarstyrd SELECT;
  klienter saknar direkta skrivrättigheter. Kurscache är endast för servern.
- Miljötabellen får en teknisk identitetsrad med projektref, runtimeversion och
  synthetic-only. Den innehåller inga användar- eller portföljdata. Service har
  bara SELECT där, klienter ingen åtkomst. Detta är en miljömarkör, inte ett
  tekniskt bevis på vilket Supabase-projekt SQL Editor är anslutet till.
- Skapa 15 funktioner: `require_staging_synthetic_user`,
  `require_staging_performance_test`, `validate_staging_opening`,
  `staging_cash_delta`, `replay_staging_performance_ledger`,
  `initialize_staging_performance_portfolio`, `register_staging_portfolio_trade`,
  `publish_staging_performance_observations`, `get_staging_performance_environment`,
  `get_staging_performance_worker_input`, `commit_staging_performance_import`,
  `correct_staging_portfolio_trade`, `publish_staging_history_batch`,
  `register_staging_portfolio_cash`, `archive_staging_market_batch`.
- Ersätt endast `get_portfolio_performance_input()` med samma ägarstyrda,
  invoker-baserade läsning plus `ledgerState`. Befintlig journaltrigger och
  `rls_auto_enable` ändras inte. Schema-cache får en NOTIFY vid installation.

Authenticated får init/trade/cash/correction och ägarläsning. Anon får endast
ofarlig miljöidentitet. Import, worker-input, publicering och arkivering är
service-only; interna hjälpfunktioner kan inte anropas av klienter.
Skriv- och worker-vägar kräver konton med `.invalid`-adress och serverägd
`app_metadata.portfolio_staging_synthetic = true`. Användaren kan inte själv
sätta denna app_metadata. Öppningsinnehav och arkiverade produktkurser begränsas
till de sex syntetiska instrumenten; verkliga portföljer tillåts inte.

SQL återanvänder fyra lokalt granskade källfiler, med källhashar i filhuvudet.
`node scripts/buildStagingRuntimeDraft.mjs` regenererar utkastet lokalt utan
databasanslutning. De ursprungliga lokala SQL-filerna och deras loopbackskydd
är oförändrade. Nya miljö-/kontoskydd införs i den separata stagingversionen.
`npm run test:staging-runtime-local` kräver att utkastet matchar genereringen.

## Preflight och rollback

En transaktion omfattar hela installationen. Preflight kräver noll Auth-konton
och tomma grundtabeller, exakt grundtabell-/funktionsinventering, RLS,
granskad automatic-RLS-funktion/trigger, normerade funktionskällhashar,
RPC-rättigheter, ägarpolicyernas uttryck och tabellbehörigheter.
Oväntade objekt, skrivbehörigheter och omkörning stoppar. Även efter ett senare
godkännande krävs separat projektidentitetskontroll och full läsande jämförelse
mot sparat foundation-underlag före körning; SQL kan inte verifiera projekt-ID.

DDL-fel rullar tillbaka allt. Efter framgång görs ingen automatisk DROP eller
journalradering. Vid oväntat resultat: stoppa tjänst/klient, bevara katalogbevis
och besluta om återställning separat. Backup och återläsning ska planeras med
Auth-identiteter, FK-kedjor och rollrättigheter. Nya import/runs/corrections-FK
har inte ON DELETE CASCADE: säker städning måste ta exakt dessa testanvändares
runtime-rader före Auth-radering. Enbart foundation-testets gamla kaskadstädning
är därför inte tillräcklig efter runtimeinstallationen.

## Lokal frontend och tjänst

`staging-app/main.jsx` är separat från `src/App.jsx`; den importerar ingen
legacyapp eller produktionsklient. `vite.staging.config.js` avvisar dessa
beroenden vid laddning och använder egen env-katalog och ingen PWA.
`npm run staging:build` bygger men driftsätter ingenting.

Import, graf, avstämning, affärsformulär och journalverktyg återanvänds.
Staging har egen session/preferensscope. Den separata klienten accepterar bara
projektref `vutjthqlgzokeylaxpzp`, frontend `http://127.0.0.1:55810` och tjänst
`http://127.0.0.1:55811`. Fel konfiguration eller saknad runtime stoppar;
ingen fallback till produktions-API, legacy eller lokal demo finns.

`npm run staging:plan` är offline. `scripts/stagingAppServer.mjs` är förberedd
men har **inte startats mot molnet**. `--run-approved` kräver nytt godkännande.
Den läser endast specifika stagingvariabler från processmiljön, aldrig dotenv
eller produktionskonfiguration. Servern verifierar Supabase Auth-token och
syntetisk kontomarkör och härleder ägaren. Klienten kan inte välja användar-ID
eller värderingsdatum. CORS tillåter endast stagingorigin. Inga schemalagda jobb
eller automatisk insamling startas; omräkning sker på godkänd import/begäran.

Portföljkurser/FX är uttryckligen testdata 2–9 oktober; serverns demonstrations-
klocka är 10 oktober 2026. En affär efter detta scenario får registreras, men
har ingen dagsvärdering i demoarkivet och ska inte visas som avkastning.
För köp/sälj i det daterade scenariot väljer provanvändaren datum 5–9 oktober.
Ingen framtida marknadskurs skapas. Verkliga OMXS30/S&P 500 och ECB-indexvaluta
kan hämtas via stagingtjänstens särskilda indexrutter; vid fel visas besked,
inte ett påhittat index. Portföljjämförelsen förblir en syntetisk demonstration.

## För att ägaren ska kunna prova i webbläsaren

1. Godkänn exakt runtime-SQL **separat**, efter lokal testredovisning. Kontrollera
   projektidentitet och oförändrad/tom foundation i molnet innan installation.
2. Godkänn ett nytt avgränsat tvåkontos-E2E-test enligt
   [testplanen](end-to-end-test.sv.md), inklusive testskrivningar, retention och
   explicit städning. Det tidigare isolationstestets godkännande täcker inte detta.
3. Tillåt start av den lokalt körda stagingtjänsten mot just stagingprojektet.
   Använd de befintliga privata stagingnycklarna i en tillfällig process;
   miljön `PORTFOLIO_STAGING_URL`, `PORTFOLIO_STAGING_ANON_KEY`,
   `PORTFOLIO_STAGING_SERVICE_KEY` behöver verifieras där. Inga hemligheter i
   kommandorad, frontend, Git, loggar eller chatt. Publicera inte tjänsten.
4. Lägg endast publik stagingkonfiguration i en privat, Git-ignorerad
   `staging-app/.env.local`: `VITE_STAGING_APP=true`,
   `VITE_STAGING_SUPABASE_URL=https://vutjthqlgzokeylaxpzp.supabase.co`,
   `VITE_STAGING_API_URL=http://127.0.0.1:55811`,
   `VITE_STAGING_PUBLISHABLE_KEY=<endast stagingprojektets publika nyckel>`.
   Kopiera inte rootprojektets env. Service-/secret-nyckel är förbjuden här.
5. Efter det nya godkännandet: starta staging-API och `npm run staging:ui`,
   öppna `http://127.0.0.1:55810` och logga in med privat överlämnat syntetiskt
   testkonto. Ingen frontenddeployment eller nya externa resurser behövs.
6. Efter demonstration: stoppa processerna och städa endast verifierade
   testidentiteter när det godkända testscopet säger det. Om ägaren vill behålla
   provkontot en tid ska tidsgräns och vilka syntetiska poster som får finnas kvar
   beslutas före skapandet.

Det finns inget behov av att lämna riktiga portföljuppgifter. Hosted staging,
automatisk daglig insamling och verkliga datakällor kräver senare separata beslut.

## Genomförd lokal verifiering

- Docker Desktop startades från den installerade användarsökvägen. Lokal
  containeridentitet och port verifierades av varje databasskript.
- Slutligt `002-runtime.approval.sql` installerades ovanpå exakt
  `001-foundation.auto-rls.approval.sql` i scratch
  `portfolio_staging_runtime_ba12ae18ed`. Aktiv `ensure_rls` med den observerade
  funktionsdefinitionen orsakade ingen konflikt. Åtta RLS-tabeller totalt.
- DDL-fel gav full rollback. Oväntad tabell, utökad klientbehörighet och
  omkörning stoppades. Två markerade syntetiska ägare och en omarkerad kontroll.
  Omarkerad användare och verkligt instrument avvisades.
- Öppning 7200 SEK, återimport, köp/sälj/insättning, idempotens, ogiltig affär,
  revisionskonflikt, serverhistorik utan session, TWR/Dietz och 0 %-ankare passerade.
  Rättelse bevarade gamla observationer. Saknad NAV publicerade bara komplett
  prefix och återhämtning fyllde rätt datum. Kursarkivets rättelse/dubblett och
  ogiltig batch med rollback av källor/revisioner passerade.
- Befintliga lokala legacyinnehav, snapshots och baselines hade identiska
  fingeravtryck före/efter den slutliga, separat körda runtime-repetitionen.
- Befintliga `test:local-db`, `test:local-security`, `test:local-migrations`,
  `test:local-fx` och `test:local-main-flow` passerade. Valuta-/huvudflödes-
  regressionerna använder nu explicit fixtureklocka; liveinsamlingens klocka
  ändrades inte. Den första valutatestkörningen stoppade korrekt vid saknad
  12 oktober-kurs, innan testscenariot fick uttryckligt slutdatum.
- 364 enhetstester inklusive den injicerade HTTP-kedjan passerade. Lint,
  vanligt build, lokaltest-build och staging-build passerade. Befintliga
  bundle-storleksvarningar kvarstår.
- Tidiga repetitionsfel var assertions för feltext/search_path-format och
  namnmappning av historik-RPC. De rättades innan godkänd slutkörning. En
  fingeravtryckskörning överlappade syntetiska regressioners skrivningar och
  avvisades; slutkörningen gjordes sekventiellt utan överlapp.
- Ingen stagingnyckel lästes, ingen molnkontakt etablerades och inga molnobjekt
  ändrades. SQL-stubb och injicerad Auth ersätter inte molninloggning.
  Ny webbläsar-/mobil-E2E och managed-cloud-backup/restore är ännu inte utförda.
