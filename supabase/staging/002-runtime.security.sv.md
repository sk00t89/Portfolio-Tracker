# Slutgranskning och nytt migrationsgodkännandeunderlag

Endast målprojekt `vutjthqlgzokeylaxpzp`. Ingen molnkontakt eller migration
gjord i denna granskning. Kontrollerna utgår från den exakta godkända foundation-
filen och sparad katalog från dess installation. Funktionskällorna i det sparade
underlaget jämfördes och matchar godkänd SQL efter radslutsnormalisering.
Aktuell projektidentitet, tomhet och hela katalogen måste kontrolleras igen
före en senare uttryckligen godkänd molnkörning.

## Reviderad fil som kan godkännas

[002-runtime.approval.sql](002-runtime.approval.sql), SHA-256 med LF-radslut:

`d05fed65438fe2b35332f007c93012f26585d114fb6b5e42cfa15926843399d4`

Denna version ersätter tidigare `8b81188f…`. Ändringar i slutgranskningen:

- Affärer måste gälla en syntetisk position/konto/valuta i öppningen; godtyckligt
  nytt instrument-ID kan inte introduceras genom affärs-RPC:n.
- Importens `set_config('request.jwt.claim.sub', ...)` är borttagen helt.
  Ny intern `register_staging_trade_for_owner` använder explicit kontrollerad
  ägare. Den vanliga affärs-RPC:n är en wrapper som skickar `auth.uid()`.
- Explicit REVOKE från PUBLIC, anon, authenticated **och service_role** före
  respektive tillåten GRANT. Detta neutraliserar även generösa default grants.
- Ägarkontrollen avvisar explicit ägare som skiljer sig från en befintlig
  inloggad identitet. En ren servicebegäran utan användaridentitet får välja
  endast en markerad syntetisk ägare; service är fortsatt en betrodd serverroll.

## Objekt- och behörighetsändringar

En kolumn: `portfolio_performance_baselines.ledger_state jsonb NOT NULL`,
default `{"cash":[],"positions":[]}`.

| Ny tabell | Kolumner |
| --- | --- |
| staging_runtime_environment | singleton, project_ref, runtime_version, synthetic_only |
| staging_performance_imports | user_id, import_key, kind, payload, result, created_at |
| staging_performance_runs | user_id, revision, valuation_date, status, reason, attempted_at |
| staging_performance_market_cache | cache_key, observation, created_at |
| staging_performance_corrections | user_id, request_id, event_id, revision, previous_event, patch, created_at |

Fullständiga typer, PK/FK/check/default-villkor står i SQL-filen. Alla fem
tabeller har RLS. Import/runs/corrections: authenticated får endast SELECT
med `auth.uid()=user_id`, service_role får ALL. Cache: service_role ALL,
inga klienträttigheter. Miljötabell: endast service_role SELECT.
En teknisk miljöidentitetsrad skapas; inga Auth- eller portföljrader.
Grundtabellernas ägarpolicyer och direkta skrivförbud är oförändrade.

16 nya funktioner och en ersatt läs-RPC. Nedanstående **effektiva** EXECUTE-
matris är verifierad via `has_function_privilege` för namngivna roller och
`aclexplode(coalesce(proacl,acldefault(...)))` för PUBLIC. Testet installerade
också generösa default-EXECUTE till alla tre roller före runtimeinstallation.
Ja/nej är tillåtelse för just rollen; postgres som betrodd funktionsägare har
fortsatt implicit behörighet.

| Funktion | PUBLIC | anon | authenticated | service_role |
| --- | --- | --- | --- | --- |
| require_staging_synthetic_user | Nej | Nej | Nej | Nej |
| require_staging_performance_test | Nej | Nej | Nej | Nej |
| validate_staging_opening | Nej | Nej | Nej | Nej |
| staging_cash_delta | Nej | Nej | Nej | Nej |
| replay_staging_performance_ledger | Nej | Nej | Nej | Nej |
| register_staging_trade_for_owner | Nej | Nej | Nej | Nej |
| initialize_staging_performance_portfolio | Nej | Nej | Ja | Nej |
| register_staging_portfolio_trade | Nej | Nej | Ja | Nej |
| correct_staging_portfolio_trade | Nej | Nej | Ja | Nej |
| register_staging_portfolio_cash | Nej | Nej | Ja | Nej |
| get_staging_performance_worker_input | Nej | Nej | Nej | Ja |
| commit_staging_performance_import | Nej | Nej | Nej | Ja |
| publish_staging_performance_observations | Nej | Nej | Nej | Ja |
| publish_staging_history_batch | Nej | Nej | Nej | Ja |
| archive_staging_market_batch | Nej | Nej | Nej | Ja |
| get_staging_performance_environment | Nej | Ja | Ja | Ja |
| get_portfolio_performance_input (ersätts) | Nej | Nej | Ja | Nej |

Läs-RPC:n förblir SECURITY INVOKER och tillför `ledgerState`.
Alla nya funktioner har låst tom search_path. Skrivande klient-RPC:er är
SECURITY DEFINER med explicit ägarfiltrering på läsning, låsning och mutation.
Inga nya triggers; `performance_journal_changed` och automatic RLS ändras inte.
Den gamla event-triggerfunktionen `rls_auto_enable` har sin tidigare PUBLIC-
behörighet kvar; den är inte en ny vanlig skriv-RPC och ingår inte i matrisen.

## Identitet och negativa tester

Init/trade/cash/correction hämtar ägaren från `auth.uid()`, inte JSON eller
klientvalda parametrar. Baseline låses `FOR UPDATE` på just ägaren. Event-ID,
request-ID, rättelser och kassauppdateringar söks med samma user_id.
Markör i serverägd app_metadata och `.invalid`-adress krävs.

Serviceimport/publicering har explicit ägare och är otillgänglig för klienter.
Stagingservern verifierar Auth-token och härleder ägaren; frontendens body får
inte innehålla user_id. Delad kursarkivering kan avsiktligt invalidera flera
berörda syntetiska portföljrevisioner och är därför service-only.

Lokalt verifierat efter ändringen:

- Vanlig klient kan inte anropa serviceimport med annan ägare eller den privata
  explicit-owner-hjälpfunktionen. Fel ger nekad behörighet.
- Serviceanrop med A som befintlig session och B som explicit mål nekas.
- Den tidigare claim-ändrande grenen kördes med en syntetisk transaktionsimport
  för B, följd av A-import i **samma transaktion**. B fick sin egen affär;
  A:s input var oförändrad. `request.jwt.claim.sub` och `request.jwt.claims`
  förblev oförändrade både inne i transaktionen och i följande anrop.
- Omärkt användare, nytt verkligt instrument-ID, fel revision, översäljning,
  direkt klientskrivning och åtkomst till annan ägares rader avvisas.

SQL-stubben simulerar PostgREST-identitet; managed Auth/JWT och browser-E2E
verifieras efter separat tillstånd. Service_role kringgår RLS och är **inte**
en isolerad användarroll. Komprometterad service-/databasägaråtkomst kan ändra
data; nyckeln måste förbli privat. Inga sådana nycklar lästes här.

## Atomisk migration och återställning

Runtimeinstallationen är en BEGIN/COMMIT-transaktion. Exakt foundation med
aktiv automatic-RLS-trigger användes lokalt. Injicerat fel lämnade inga nya
kolumner/funktioner/tabeller. Import/affärer/kassa/revisioner och kursbatcher
har separata testade atomiska felvägar; gamla observationsrevisioner bevaras.

Efter framgång men innan testkonton/data skapats kan en separat godkänd
[tom återgång](002-runtime.empty-revert.approval.sql) återställa foundation:
ursprunglig läs-RPC/ACL, borttagning av endast 16 uttryckliga runtimefunktioner,
fem nya tabeller och ledger_state-kolumnen. Ingen CASCADE används. Den stoppar
vid Auth-konton, portföljposter, cachedata eller oväntad katalog.
Återgången ingår **inte** i godkännandet för runtime-migrationen.

Har data hunnit skapas: stoppa tjänst/klient först, bevara katalog och journal,
ta separat backup och verifiera återläsning till separat godkänt mål. Använd
inte tomhetsåtergången för att ta bort testdata eller journal. Molnbackup/restore
är inte verifierad; detta hindrar verklig pilot, men inte den första tomma
schema-migrationen eller ett separat godkänt reproducerbart syntetiskt test.

## Miljöseparation och godkännandets omfattning

Ingen produktionsnyckel, riktiga uppgifter eller legacyanslutning användes.
Separat staging-entry/config blockerar produktions- och legacyklienter.
Projekt-ID och tomhetskontroll måste verifieras före körning; SQL-kommentaren
eller miljöraden bevisar inte projektidentitet. Vid avvikelse: stoppa.

Begäran gäller endast exakt reviderad `002-runtime.approval.sql` med ovanstående
SHA i `vutjthqlgzokeylaxpzp`, plus läsande preflight/efterkontroll.
Det omfattar dess enda tekniska miljörad och deklarerade schema/GRANT/NOTIFY.
Inga testkonton, syntetiska portföljskrivningar, serverstarter, automatiska jobb,
deployments, produktionsändringar eller tomhetsåtergång omfattas.

Inget kvarstående identifierat klientisoleringshinder finns för ett begränsat
syntetiskt E2E-test efter migration och separat testgodkännande. Testets exakta
poster/städningskvitton, managed Auth, mobilvy och molnåterläsning återstår
att förbereda/verifiera i sina respektive scope. Verkliga marknadsdata är
fortsatt en pilotbegränsning, inte en anledning att fabricera demonstrationens
avkastningshistorik.

## Slutlig körningsverifikation

`npm run test:staging-runtime-local` passerade i isolerad lokal scratch
`portfolio_staging_runtime_2b35d2cb45`: hela runtimekedjan, effektiv EXECUTE-
matris, claim-/ägarnegativer, migrationsrollback och tomhetsåtergång inklusive
injicerat återgångsfel. Databasen lämnades återställd till foundation; inga
provkonton/data finns kvar där. Den befintliga lokala databasen hade oförändrat
fingeravtryck. En första återgångsjämförelse stoppade vid osorterad kolumn-
inventering; jämförelsen sorterades på tabell/kolumn utan att ändra SQL, och
den slutliga körningen verifierade alla kolumner och funktionsdefinitioner.

364/364 enhetstester och lint passerade efter SQL-härdningen. Frontendkoden
ändrades inte i slutgranskningen; de tidigare godkända tre byggena gäller samma
frontend. Diff-/hemlighetskontroll görs före commit/push. Moln, testkonton,
deployment och produktionsdata är fortsatt orörda.

Återgångsfilens separata SHA-256 (LF) är
`37e3ad06c1b678d0c1558888a92f0cdacb6174788f60ac8dcc2521f1c037e7af`.
Denna fil är endast en lokalt provad reservplan och får inte köras i molnet
utan eget uttryckligt godkännande.
