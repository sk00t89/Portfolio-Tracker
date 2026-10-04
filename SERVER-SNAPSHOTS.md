# Manuella tillgångar, marknadsstatus och dagliga servervärden

Projekt: `C:\Users\marke\WebstormProjects\Portfolio-tracker`.
Implementation är lokal. Ingen migration, deployment, cron-aktivering, commit eller push har utförts.

## Steg 1: kontokopplade manuella tillgångar

`manual_assets` har RLS för den inloggade användaren. Formulär och listor behåller sitt utseende; sparande och borttagning går först till Supabase. Ett misslyckat anrop raderar inte formuläret eller det lokala originalet. UUID ersätter lokala numeriska ID:n.

Den gamla globala localStorage-nyckeln `assets` saknar ägare. Användaren måste därför bekräfta vilket konto tillgångarna tillhör. Ingen automatisk tilldelning sker. Den andra knappen behåller originalet för ett annat konto och sparar ett kontospecifikt avböjande, så att samma fråga inte återkommer på varje inloggning.

Vid import:

1. En Web Lock serialiserar migrering mellan flikar på samma origin. Ägare och oförändrat original kontrolleras igen inne i låset.
2. Batchens ägare samt `manualAssetsBackup:<userId>:<batchKey>` sparas innan nätverksanropet.
3. En RPC gör hela importen i en databastransaktion. Deterministiska `legacy_key` och unikhetsvillkoret `(user_id,legacy_key)` gör återförsök idempotenta. Redan importerade/ändrade molnvärden skrivs inte över. Avsiktligt identiska rader får separata nycklar.
4. Molndatan läses tillbaka innan originalnyckeln tas bort. Om originalet ändrats under tiden behålls det.

När lokal migrering väntar sätts `manual_assets_ready=false`; både klienthistorik och servervärdering spärras. Import eller ett uttryckligt val att använda endast molntillgångarna sätter flaggan till true. Användare utan lokal legacy-data initieras med tom import. Workern arbetar endast med redan initierade konton.

## Steg 2: marknadskalendrar

Gemensam kalender används av UI och worker. Ordinarie aktiehandel: Stockholm 09:00–17:30, halvdag 09:00–13:00; USA 09:30–16:00 New York, halvdag 09:30–13:00. UI visar Stockholmstid. `Intl` och IANA-zoner hanterar DST; ingen fast UTC-offset används.

Verifierade kalenderundantag täcker **2026–2027** enligt [Nasdaq](https://www.nasdaq.com/european-market-activity/trading-hours) och [NYSE](https://www.nyse.com/trade/hours-calendars). Helger, observerade helgdagar och halvdagar finns explicit. Utanför kalenderns täckning är status okänd och börsvärdering stoppas. Kalendern behöver uppdateras inför 2028. Handelsstopp och oförutsedda extrastängningar ingår inte.

Kortet uppdateras var 30:e sekund och vid återgång till fliken. Dagens förändring förklarar helgdag/söndag/lördag eller att börsen ännu inte öppnat, när dagskurser saknas. Direkt krypto är öppet 24/7. Kryptocertifikat följer sin handelsplats. För-/efterhandel och andra handelsplatsers specialtider omfattas inte.

## Steg 3: snapshot och samtidighet

Ny Edge Function: `daily-portfolio-snapshot`. Nycklar, service-role och ett separat `SNAPSHOT_CRON_SECRET` stannar server-side. Varje POST kontrollerar hemligheten; avstängd JWT-kontroll för just denna function ersätts med obligatorisk kontroll i handlern. Befintlig `market-api` behåller `verify_jwt=true`.

Skrivning kräver **både** serverinställningen `SNAPSHOT_WRITES_ENABLED=true` och anropets `dryRun=false`. Standard är dry-run. En dry-run skriver varken historik eller körresultat. Begär inte `continue=true` under en isolerad dry-run om ingen lokal kö har konfigurerats.

SQL läser holdings, manuella tillgångar, Lysa-transaktioner och `input_revision` i ett gemensamt MVCC-tillstånd. Revisionen ändras av innehavs-/tillgångs-/Lysa-transaktionsändringar; vanliga prisuppdateringar ändrar inte revisionen. Revision och readiness kontrolleras igen vid atomär skrivning. Ett ändrat underlag innebär fel och senare återförsök.

`observed_at` fångas **före** databasläsning och kurshämtning. Den skrivande RPC:n använder samma `ON CONFLICT ... WHERE existing.observed_at < excluded.observed_at` som klienten. Äldre och lika observationer ersätter aldrig nyare. Primärnyckeln `(user_id,valuation_date)` ger maximalt en rad per dag; ingen särskild jobblåsning krävs. Överlappande jobb kan göra samma kursanrop men kan inte skapa dubbla historikrader. Klientens RPC och hooks fortsätter fungera. `source` och `source_metadata` anger vilken observation som vann.

Exakta värderingsregler:

- **Aktier/ETF/övriga börsinstrument:** Yahoo daily-chart, det ojusterade `close` från exakt senaste avslutade ordinarie handelssession enligt relevant kalender. Yahoo-symbolen byggs separat från holding-tickern: ett punktseparerat enbokstavs-klassuffix blir bindestreck (BRK.B → BRK-B, BF.A → BF-A). Stockholm-suffixet .ST hanteras separat och bevaras; normaliseringen skriver aldrig tillbaka till databasen. Symbol, exchange och tidszon verifieras. Aktuell intradagskurs eller föregående tillgängliga äldre stapel får inte ersätta den väntade sessionen. Saknad stapel blockerar hela snapshoten. Explicit börsidentifierare och ticker krävs.
- **Direkt krypto:** CoinGecko `simple/price` i SEK med `include_last_updated_at=true`. Sparat `coin_id` prioriteras, befintlig känd symbolmappning används som fallback. Verklig källtidsstämpel krävs, högst 30 minuter gammal och högst en minut framåt. Fetch-tid fabriceras aldrig som källtid. Värdet representerar leverantörens senaste observation nära snapshot-tidpunkten, inte en garanterad sekundexakt handel.
- **Lysa:** nettovolym beräknas från molnets Buy/Switch buy/Sell/Switch sell med samma avrundning till fyra decimaler som klienten. Senaste publicerade NAV från befintlig Lysa funds-endpoint används; datum måste vara giltigt, inte framtida och högst sju Stockholm-kalenderdagar gammalt. Okänd fond, negativ nettovolym eller saknad NAV blockerar allt.
- **Certifikat/ETP:** Avanza-origin använder Avanzas befintliga market-guide/stock-källa först; Nordnet-origin använder Nordnets instrument_search + instruments/price först. Om första brokerkällan saknar godkänd kurs provas ISIN-uppslagning hos den andra brokern. En godkänd brokerkurs sparas som kandidat medan Yahoo/historisk close kontrolleras; verifierad historisk close prioriteras alltid. Saknas sådan används brokerkandidaten. Provider-specifika ID:n används bara hos explicit angiven provider. Brokerdetaljer verifierar identitet via exakt eget provider-ID eller cross-provider ISIN. Konsistenskontroller av kandidatens instrument-ID/ISIN/ticker/market är tri-state: saknad/null/tom = unknown, samma = match, uttryckligt avvikande = mismatch. Saknad ticker/market underkänner inte verifierad identitet; uttryckliga motsägelser blockerar. Name redovisas som diagnostik, inte som identitetsbevis eller en strikt textjämförelse. Same-provider lookup med exakt instrument-ID tillåter saknad ISIN; om källan innehåller ISIN och innehavet har ISIN måste de stämma överens. Cross-provider kräver verifierad ISIN och får aldrig använda ursprungsproviderns instrument-ID. Ticker/name ensamt verifierar inte identitet. Stockholmsbörsen och igenkända UTF-8/Latin-1/Windows-1252-mojibakevarianter normaliseras före kalender/listing-mappning till XSTO. Giltig UTF-8-dekodning tillåts i högst två steg, följt av NFC/trim/versaler och en explicit namn-aliaslista; okända namn ges ingen godtycklig marknad. Kalender, listing-validering och brokerkonsistens använder samma normalizeMarketCode. ST/XSTO/STOCKHOLM är stavningsalias, FNSE/XSAT/SPSD förblir skilda listing-koder. SPSD finns i samma LISTING_CALENDARS-mapping som kalender och listing-validering använder; certifikat behåller börshandlad klassificering och kurs-/identitets-/sessionskraven. Senaste kurs måste vara positiv med valuta och verklig källtidsstämpel inom det inkluderande fönstret 5 minuter före till 60 minuter efter senaste avslutade sessionens stängning; den får inte ligga i framtiden. Marknaden måste nu vara stängd enligt kalendern (after_close/before_open/closed_day), kalendern måste vara känd och sessionen måste fortfarande vara den senast avslutade. Detta mäter färskhet mot relevant session, så fredag kan vara giltig under helgen men föregående session får aldrig ersätta en senare avslutad session. Gränserna följer kalenderns halvdagar/DST. previousClose och godtyckliga intradagskurser används aldrig. Yahoo kräver dessutom exakt ISIN i metadata, symbol, börs/tidszon och rätt dagsstapel; gissad .ST-symbol ensam verifierar aldrig ett certifikat. Misslyckande ger LISTED_PRODUCT_CLOSE_UNAVAILABLE med instrument, attemptedProviders, attempts och säkra httpErrors i dry-run/serverlogg. Varje brokerförsök innehåller identityVerification.requested (provider, faktisk requested instrumentId eller null vid ISIN-lookup, isin/ticker/market) samt checks med kandidatens id/isin/ticker/name/market, fieldStates (unknown/match/mismatch), identityBasis, failedChecks och responseIdentityFields med de tillåtna identitetsfält som faktiskt fanns, inklusive fältsökväg och typ. Fel specificerar instrumentId mismatch, ISIN missing/mismatch, ticker mismatch, market mismatch eller no candidate found. Flera detaljkandidater bevaras; misslyckad sökning visar högst fem kandidater med totalantal/trunkeringsflagga. Varje tidskontroll som nås lägger till attempts[].timeVerification med brokerQuotePrice, brokerQuoteTimestampRaw (oförändrad scalar), rawTimestampType, normalizedTimestamp/normalizedTimestampMs, quoteSessionDate, latestCompletedSessionDate, requestedSessionDate, officialSessionCloseTimestamp, latestCompletedSessionCloseTimestamp, allowedWindowStart/End, deltaFromCloseSeconds/Minutes, currentMarketStatus, evaluatedAt och failedConditions. Alla relevanta orsaker visas: market_open, timestamp_missing/invalid/future, before_window, after_window, wrong_session, stale_session; okänd kalenderstatus visas separat som market_status_unknown. wrong_session anger avvikande quote-datum eller att begärd session inte längre är senaste; stale_session anger äldre quote-/sessionsdatum än senaste avslutade session. Diagnostiken redovisar den aktuella regeln utan att i sig ändra beslutet. Brokerfönstret är nu −5/+60 minuter och quoteSessionDate måste uttryckligen matcha latestCompletedSessionDate. Recheck kan ge en ytterligare kontroll med stage=recheck och bevarad rå tidsstämpel. Fullständiga svar, headers och auth-data loggas inte. sources redovisar vald provider och försök samt sourceMetadata.provenance: broker_latest_after_close eller historical_session_close. Brokerprovenance inkluderar sessionDate, officialCloseAt, quoteTimestamp, offsetFromCloseSeconds och toleransen 300/3600 sekunder. Nordnet tick_timestamp och Avanza quote.timestamp behandlas som brokerkursens källtid, utan att flyttas till stängningstid eller ersättas med fetch-tid. En timestamp +30 minuter bevisar inte en historisk bar; ingen dokumenterad garanti om orsaken till tidsförskjutningen antas. kind=session_close behålls som värderingskategori; sourceMetadata skiljer tydligt brokerapproximation från historisk bar.
- **Vanliga fonder:** FUND med fondmarkering FUND/MUTUAL_FUND eller utan börsidentifierare använder sin faktiska provider först: Avanza fund/guide-källa respektive Nordnet fundlist. Explicit börs, även okänd, eller ETF/ETP/certifikatklassificering behåller kalenderkravet. Instrument-ID används endast i sin uttryckligen angivna providers namespace; inga ID:n överförs mellan providers. Cross-provider fallback kräver ISIN-sökning och verifierat ISIN i fondsvaret. Saknas provider kan en känd plattform styra sökordningen, men den gör inte ett okänt ID betrott. ID/ISIN och fondkälla verifieras, uttryckliga börshandlade typer från källan avvisas. NAV/källtid måste finnas, vara giltig, inte framtida och högst sju Stockholm-kalenderdagar gammal, även på fallback. Ingen lagrad reservkurs eller fabricerad fetch-tid används. Dry-run sources anger lyckad provider och attemptedProviders; fondfel och serverlogg innehåller provider, sourceProvider, attemptedProviders, attempts med felorsak samt instrumentidentitet. Avanzas API-svar har verifierats med fixtures, inte mot live-data i denna miljö.
- **Valuta:** SEK behöver ingen FX. Övriga stödda treställiga valutakoder kräver framgångsrik Frankfurter-hämtning, positiv kurs till SEK och publiceringsdatum högst sju kalenderdagar gammalt. Ingen fallback till 1. Minor units som GBp godtas inte.
- **Manuella tillgångar:** aktuellt molnvärde i SEK; namn/kategori/värde skyddas av tabellvillkor. Dessa omvärderas inte automatiskt.
- Alla relevanta positioner måste lyckas. Fel, osäker identitet, ofullständigt underlag eller ogiltigt värde stoppar användarens hela snapshot. Kursanrop har timeout på 12 sekunder och total budget 65 sekunder. Observationer som passerat Stockholm-midnatt eller blivit äldre än 20 minuter får inte sparas.

Ett anrop behandlar högst en användare och returnerar `nextCursor`. Med `continue=true` köas nästa batch via pg_net och Vault. Fortsättningen är helt server-side. `portfolio_snapshot_runs` redovisar saved/superseded/failed per användare/dag; äldre körresultat kan inte skriva över nyare. Lyckade/superseded serverkörningar hoppas över vid återförsök. En befintlig intradagspunkt från klienten hindrar inte en första serverkörning.

Cron startar 23:30, 23:40 och 23:50 **Europe/Stockholm**, även helger. USA har då stängt både under vanlig DST och veckorna med olika omställningsdatum. Helgdagar använder senaste avslutade session, Lysa sitt senaste giltiga NAV och krypto snapshot-kurs. Fredagens stängning får alltså ligga till grund för helgens börsvärde medan krypto kan förändras. Ingen backfill görs.

## SQL i ordning, endast efter separat godkännande

Produktionsprojektets befintliga `holdings`, `accounts` och `lysa_data` förutsätts finnas. De ändras inte med en ny grundmigration.

1. `C:\Users\marke\WebstormProjects\Portfolio-tracker\supabase\dashboard-history.sql` – återanvänd den aktuella versionen även om en äldre historikversion redan finns.
2. `C:\Users\marke\WebstormProjects\Portfolio-tracker\supabase\manual-assets.sql` – manuella tillgångar, readiness och konto-/import-RPC:er.
3. `C:\Users\marke\WebstormProjects\Portfolio-tracker\supabase\snapshot-worker.sql` – coin_id, proveniens, revisionstriggers, server-RPC:er och körresultat. Den här filen ersätter klient-RPC:n med motsvarande atomär regel som även återställer proveniens till client.
4. Skapa Vault-hemligheterna `portfolio_snapshot_url` (fullständig function-URL) och `portfolio_snapshot_secret` (samma slumpmässiga hemlighet, minst 32 tecken, som functionens `SNAPSHOT_CRON_SECRET`). Använd Vault-UI; lägg inte själva värdena i SQL-filer eller frontend-env.
5. `C:\Users\marke\WebstormProjects\Portfolio-tracker\supabase\snapshot-cron.sql` – kräver pg_cron, pg_net och Vault. Registrerar jobbet **inaktivt** i en transaktion.
6. **Separat, först efter verifiering och godkännande:** `C:\Users\marke\WebstormProjects\Portfolio-tracker\supabase\snapshot-cron-activate.sql`. Detta är den enda filen som aktiverar cron.

`local-fixture.sql` är endast för tom lokal testdatabas. `snapshot-checks.sql` och `dashboard-history-checks.sql` är återställda testtransaktioner, inte produktionsmigrationer. Inga av SQL-filerna har körts här.

## Edge Functions och serverinställningar

- `daily-portfolio-snapshot` behöver deployas efter schema och lokala kontroller. Sätt `SNAPSHOT_CRON_SECRET`, eventuell `COINGECKO_API_KEY` av samma demo-typ som befintlig adapter och inledningsvis `SNAPSHOT_WRITES_ENABLED=false`. Supabase tillhandahåller service-role/URL som server-env.
- `market-api` behöver deployas om tidigare ändringar för genuina Yahoo/Avanza-källtidsstämplar ännu inte är deployade. Ingen ny kalender- eller workerimplementation kräver att dess auth eller gamla endpoints ändras.

Slå på writes först efter en granskad dry-run med kompletta innehav. Cron hålls inaktiv tills allt är kontrollerat. Detta dokument har inte utfört någon deployment eller aktivering.

## Exakta lokala tester före deployment

Alla kommandon körs i projektmappen. De första två kräver endast projektets befintliga Node-installation:

```powershell
Set-Location 'C:\Users\marke\WebstormProjects\Portfolio-tracker'
npm test
npm run build
```

Tester inkluderar tidigare historik/periodstart/SEK-rankning, migrationens identiteter och validering, kalender/DST/halvdagar, fullständig servervärdering, leverantörsfel, tidsgränser, HTTP-auth, dry-run, skrivfönster och batchfortsättning. De använder fixtures/mocks och gör inga externa anrop. Edge-handlerns TypeScript strippas och exekveras mot en isolerad SDK; detta ersätter inte Deno/SQL-integration.

**Lokal integration kräver Supabase CLI, Docker och psql. Dessa saknas i denna miljö och har inte installerats eller körts.** När du har dem tillgängliga och väljer att skapa en lokal testdatabas:

```powershell
supabase start
supabase status
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/local-fixture.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/dashboard-history.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/manual-assets.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/snapshot-worker.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/snapshot-checks.sql
```

`supabase start` tillämpar repoets befintliga Lysa-migration endast i den lokala Docker-databasen. Kommandona ovan använder explicit localhost och aldrig `--linked`. Om port/credentials skiljer sig, använd lokal DB URL från `supabase status`. Kör inte dessa kommandon mot produktions-URL. `snapshot-checks.sql` testar RLS mellan två rollback-användare, ägarskydd, idempotent import, bevarade molnändringar, server-RPC-behörigheter, revision, older/equal observation och klient/server i samma dagsrad. Kör kontrollerna minst fem minuter från Stockholm-midnatt eftersom de använder observationer ett par minuter tillbaka.

Skapa `C:\Users\marke\WebstormProjects\Portfolio-tracker\supabase\.env.snapshots.local` (git-ignorerad) med:

```dotenv
SNAPSHOT_CRON_SECRET=local-test-secret-at-least-thirty-two-characters
SNAPSHOT_WRITES_ENABLED=false
COINGECKO_API_KEY=<valfri lokal servernyckel>
```

Starta en separat terminal i projektmappen:

```powershell
supabase functions serve --env-file supabase/.env.snapshots.local
```

Skapa/konfigurera `C:\Users\marke\WebstormProjects\Portfolio-tracker\.env.local` för endast den lokala teststacken:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<lokal anon/publishable key från supabase status>
VITE_MARKET_API_URL=http://127.0.0.1:54321/functions/v1/market-api
```

Ingen service-role, CoinGecko-nyckel eller cron-hemlighet får ligga i en VITE-variabel. Behåll eventuella produktionsinställningar säkert innan du ändrar din lokala, ignorerade env-fil. `npm run dev`, öppna localhost:5173, registrera två **lokala** testkonton med lösenord och verifiera vid behov lokal testmejl via Inbucket-URL från status. Använd lösenordslogin för lokal testning; OAuth kräver separat callback-konfiguration.

UI-test:

1. I en separat testprofil/origin, använd DevTools: `localStorage.setItem('assets',JSON.stringify([{id:1,name:'Testkonto',category:'CASH',value:123,source:'manual'}]))`. Ladda om. Kontrollera kontonamnet och välj Flytta. Bekräfta exakt en molnrad, att localStorage `assets` försvunnit och att backup/owner finns. Lägg till/ta bort via befintligt formulär/lista; ladda om och kontrollera persistens.
2. Logga in på konto B och kontrollera att konto A:s molntillgång inte syns. Testa även knappen Tillhör ett annat konto, omladdning och fortsatt bevarande av originalet. Återställ samma legacy-fixture för samma konto och migrera igen: befintlig rad ska varken dupliceras eller skrivas över. Simulera API-fel/offline: original/formulär ska finnas kvar och historik ska pausas.
3. Kontrollera kortet i dark/light och vid 375px samt desktop. USA-tider visas i Stockholmstid, direkt krypto 24/7. De deterministiska kalenderdatumen för helg/halvdag/DST verifieras i npm test utan att ändra systemklockan.
4. Lägg till ett stödd börsinstrument med riktig ticker/market (t.ex. AAPL/US), direkt BTC och Lysa-transaktioner om du vill kontrollera alla adapters. Samma instrument i två konton ska grupperas och SEK-bidrag ska styra Bäst/Sämst. Växla SEK/USD/EUR och kontrollera faktiska periodstartdatum. Okänt instrument får inte skapa ett partiellt historikvärde.

Hämta användarens UUID från **lokala** Studio/Auth. Anropa sedan en dry-run (ingen fortsättningskö):

```powershell
$snapshotHeaders = @{ 'x-snapshot-secret' = 'local-test-secret-at-least-thirty-two-characters' }
$snapshotBody = @{ userId = '<lokal användar-UUID>'; dryRun = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/daily-portfolio-snapshot' -Headers $snapshotHeaders -ContentType 'application/json' -Body $snapshotBody
```

Jämför dry-run-total och sources med innehav, publicerad stängningsstapel, CoinGecko och Lysa NAV. Kontrollera att ingen historikrad eller körresultatrad ändrats av dry-run. Fel hemlighet ska ge 401. Samma anrop med dryRun=false ska ändå vara dry-run medan env-switch är false.

För **enbart lokal** skrivintegration: sätt switchen till true i den lokala env-filen, starta om function-servern och anropa med dryRun=false **23:30–23:59 Stockholmstid**. Kontrollera source=server, en rad per användare/dag och observed_at före fetching. Gör ett felaktigt innehav: status ska bli failed och ingen ny/ändrad värderingsrad ska skapas. SQL-testet ovan testar äldre/nyare/equal skrivning och revision utan att vänta på kvällens fönster. Stäng därefter av den lokala switchen igen. Aktivera ingen cron för dessa teststeg.

Valfri lokal kökontroll: skapa Vault-hemligheter i den lokala databasen, med URL `http://host.docker.internal:54321/functions/v1/daily-portfolio-snapshot`, lokal testhemlighet, kör endast snapshot-cron.sql (inaktivt), begär continue=true med dryRun=true och granska pg_net-svar. Detta testar fortsättningen utan cron-aktivering. Produktions-URL/hemligheter får inte användas i lokal Vault.

## Kända begränsningar och utförd verifiering

- 159 automatiserade Node-tester passerar efter certifikat/ETP-routingen; produktionsbuild har också körts. FNSE, XSAT och SPSD är generella svenska listing-koder med STOCKHOLM-kalender i den gemensamma mappningen för kalender och listing-validering. Aktier och teckningsoptioner behåller session-close-värdering; ticker/market och verifierad kurskälla krävs fortsatt. Build varnar för huvudbundle över 500 kB. `npm run lint` har tre redan befintliga fel och en befintlig varning i App.jsx; lint för de ändrade diagnostik-/testfilerna passerar.
- HTTP-fel behåller befintlig reason och värderingsbeteende. Dry-run/serverlogg anger full instrumentidentitet, marketProvider, normalizedSymbol, listingCode, httpStatus och endpoint (origin/path, aldrig credentials/query/fragment). Fondfallback behåller HTTP-försöken i diagnostics.httpErrors. Response body läses högst 4096 byte, begränsas till säkra error-fält eller kända publika feltexter och trunkeras till 512 tecken. Kända nycklar, credential/token-indikationer, HTML, stora/otydliga svar eller läsfel utelämnas med responseBodyOmitted. Inga request-headers eller API-nycklar loggas. En cachelagrad HTTP-failure får instrumentkontext vid konsumtion så att den aktuella blockerade positionen identifieras korrekt.
- SQL, RLS i en verklig PostgreSQL-instans, Deno-runtime, live-marknadsadapters, lokal Supabase-integration och inloggad visuell UI-verifiering har **inte** körts här. De manuella stegen ovan är återstående integrationsverifiering före skarp aktivering.
- Workern täcker verifierbara Stockholm/US-listningar med explicit market och ticker, vanliga fonder som kan verifieras hos Avanza eller Nordnet, kända CoinGecko-ID:n samt befintliga Lysa-fonder. Andra börser, fonder som saknas i tillgängliga fondkällor, saknade instrument-ID:n/ISIN, GBp och börsinstrument som saknar verifierbar kurs hos sin tillämpliga källa gör att hela portföljen hoppas över. Det behövs särskilda verifierade adapters för dessa; lagrad gammal `current_value_sek` används aldrig som reserv.
- Brokerbegränsning: befintliga källor ger senaste kurs, inte ett dedikerat historiskt stängningsarkiv. Ett legitimt instrument vars senaste avslut ligger utanför fönstret −5/+60 minuter blockeras. Även inom fönstret är brokerkursen en approximation, inte en historisk close-bar; detta framgår av sourceMetadata. Även saknad nödvändig primär identitet eller timestamp, annat brokersvar eller en Avanza-källa som inte stöder instrumentet blockerar. API-fält är testade med syntetiska fixtures, inte verifierade mot live-svar här. Detta garanterar inte att det aktuella instrumentet passerar nästa live dry-run. Yahoo saknar ofta ISIN och kan då inte användas som certifikatfallback. Inget efterhandspris konstrueras.
- Yahoo-staplar är leverantörsdata, inte ett direkt handelsplatsflöde. API-blockering, rate limits och försenad publicering innebär skip/retry. CoinGecko-nyckeln använder befintlig demo-API-modell; Pro kräver annan endpoint/header. Frankfurter är publicerade referenskurser, inte tick-FX.
- Kalendern måste underhållas årligen; extraordinära stängningar kräver en kalenderuppdatering. Kring början av 2026 kan föregående session ligga 2025, som inte finns i kalendern, vilket avsiktligt stoppar snapshoten.
- Stora portföljer kan överskrida 65-sekunders fetch-budget. Långa användarkedjor kan passera midnatt och lämna användare utan dagens snapshot. För detta personliga projekt finns ingen långlivad jobbkötjänst/backfill eller automatisk larmnotifiering. Körresultat och pg_net/Edge-loggar behöver granskas före skalning.
- Klientens befintliga färskhetsregler/FX-cache består. Klient och server kan använda olika tidpunkter/källor; nyast observed_at vinner. Felställd klientklocka inom tillåten femminutersmarginal kan vinna över en serverobservation. En efterföljande klientobservation kan därför ersätta serverns closing-värde, särskilt för direkt krypto. Ingen låst officiell dagsstängning införs.
- Molnets manuella värden är kanoniska efter migrering. Okänd äldre localStorage på en annan enhet kan inte upptäckas server-side; öppna varje sådan enhet och välj ägare/import innan cron aktiveras. Appens manuella tillgångar laddas vid inloggning och efter egna ändringar, utan realtime-synkronisering av andra enheters ändringar. En omladdning behövs för dem.
- Web Locks kräver modern webbläsare och säker origin (HTTPS/localhost). Om API:t saknas stoppas migreringen med ett fel; ingen osäker fallback används.
- Befintliga backup-/resetflöden för andra portföljdelar har inte byggts om. En restore av holdings/Lysa kan fortfarande vara klientlokal enligt tidigare beteende; worker läser endast faktiskt sparad molndata. Reset över flera befintliga tabeller är inte en gemensam transaktion. Full backup/restore-synkronisering är separat arbete.
- Förändringen av historikvärde inkluderar insättningar/uttag. Arkitekturen för framtida indexjämförelse från föregående steg finns kvar; tidsvägd avkastning och historiska FX-serier ingår inte.

## Alla ändrade/tillagda källfiler i aktuell working tree

Listan inkluderar föregående dashboard-/säkerhets-/periodarbete som fortfarande är ocommittat. Inga andra redan befintliga filer har raderats. Build-output under dist är git-ignorerat.

| Fil (relativt projektroten ovan) | Ändring |
| --- | --- |
| package.json | npm test för samtliga Node-testfiler. |
| server/index.js | Tidigare genuin timestamp/previous_close för dagsdata. |
| src/App.css | Historik, valuta, movers, migrationskort och responsivt statuskort. |
| src/App.jsx | Historik/färskhet samt molnets manuella tillgångar, restore/reset integration. |
| src/components/Allocation.jsx | Tidigare visningsvaluta. |
| src/components/AssetForm.jsx | Vänta på molnsparande, bevara fält vid fel, disable när ej redo. |
| src/components/AssetList.jsx | Tidigare visningsvaluta; befintlig delete använder molncallback. |
| src/components/CryptoOverview.jsx | Tidigare visningsvaluta. |
| src/components/HoldingsOverview.jsx | Tidigare visningsvaluta. |
| src/components/PortfolioSummary.jsx | Tidigare visningsvaluta. |
| src/components/DailyMovers.jsx | SEK-rankning samt förklaringar från marknadskalender. |
| src/components/ManualAssetsStatus.jsx | Ägarskap/importval och sparfel. |
| src/components/MarketStatus.jsx | Stockholm/USA/direkt krypto med timmar/halvdag/nästa öppning. |
| src/components/PortfolioHistoryChart.jsx | Tidigare periodgraf och exakt verklig startpunkt. |
| src/data/lysaFundIsins.js | Reexport av samma oförändrade mapping från gemensam server/client-katalog. |
| src/pages/Dashboard.jsx | Kopplar in molncallback, migrationskort och marknadsstatus. |
| src/hooks/useDisplayCurrency.js | Tidigare SEK/USD/EUR-visningsvaluta. |
| src/hooks/useManualAssets.js | Kontoisolering, readiness, säker lokal migration och remote-first CRUD. |
| src/hooks/useMarketStatus.js | Kalenderstatus med uppdatering var 30:e sekund. |
| src/hooks/usePortfolioHistory.js | Tidigare debounce, verifiering och skrivkö för klienthistorik. |
| src/services/manualAssets.js | Supabase tabell-/RPC-anrop. |
| src/services/portfolioHistory.js | Tidigare historikläsning/sparande. |
| src/services/database.js | Bakåtkompatibla writes om previous_close/coin_id ännu saknas. |
| src/utils/cryptoCoinIds.js | Reexport av samma oförändrade gemensamma mapping. |
| src/utils/holdingDatabaseMapper.js | previous_close från tidigare arbete; persistens av coin_id. |
| src/utils/dashboardHistory.js | Tidigare instrumentgruppering, dagsrankning och ±3-dagars periodankare. |
| src/utils/historyWriteQueue.js | Tidigare seriell kö och monotona klientobservationer. |
| src/utils/manualAssetMigration.js | Validering, batchidentitet, idempotensnycklar och ägarkontroll. |
| src/utils/valuationFreshness.js | Tidigare klientens verifierings-/färskhetsregler. |
| supabase/config.toml | Lokal project_id; separat secret-auth functionkonfiguration. |
| supabase/functions/market-api/index.ts | Tidigare genuin quote-timestamp, auth oförändrad. |
| supabase/functions/_shared/instrumentCatalog.js | Gemensamma befintliga crypto-/Lysa-ID:n. |
| supabase/functions/_shared/marketCalendar.js | Verifierade 2026–2027-kalendrar, IANA/DST och förklaringar. |
| supabase/functions/_shared/snapshotEngine.js | Fullständig strikt värdering och snapshot-input mapper. |
| supabase/functions/_shared/snapshotProviders.js | Yahoo close, CoinGecko, FX och Lysa serveradapters med timeout/budget. |
| supabase/functions/_shared/listedProductProviders.js | Provider-first certifikat/ETP, separata ID-namespaces, identity/listing/session/timestamp-verifiering och diagnostik. |
| supabase/functions/_shared/fundNavProviders.js | Provider-first fond-NAV, verifierad fallback, 7-dagars freshness och providerdiagnostik. |
| supabase/functions/_shared/providerDiagnostics.js | Säker HTTP-/body-diagnostik och instrumentkontext utan secrets. |
| supabase/functions/_shared/snapshotRunner.js | Observationstid, dry-run och atomär write/result orchestration. |
| supabase/functions/daily-portfolio-snapshot/index.ts | Autentiserad Edge-worker med bounded batch/fortsättning. |
| supabase/dashboard-history.sql | Tidigare manuellt historikschema och klient-RPC. |
| supabase/dashboard-history-checks.sql | Tidigare manuella rollback-kontroller. |
| supabase/manual-assets.sql | RLS-tabell, migration/readiness och transactional replace. |
| supabase/snapshot-worker.sql | Revisionstriggers, provenance, server-RPC och körresultat. |
| supabase/snapshot-cron.sql | Vault/pg_net-fortsättning och inaktiv cron. |
| supabase/snapshot-cron-activate.sql | Separat manuell aktivering. |
| supabase/snapshot-checks.sql | Lokala rollback-kontroller för RLS, import och writes. |
| supabase/local-fixture.sql | Endast lokal, minimal accounts/holdings-grund för teststack. |
| tests/dashboardHistory.test.mjs | Tidigare grouping/SEK/periodstarttester. |
| tests/historySafety.test.mjs | Tidigare freshness/ordningstester. |
| tests/manualAssetMigration.test.mjs | Validering, idempotenta identiteter och kontokontroller. |
| tests/yahooSymbolNormalization.test.mjs | 4 tester för klassaktier, oförändrad intern ticker, bevarade marknadssuffix och fortsatt symbol-/HTTP-verifiering. |
| tests/marketNormalization.test.mjs | 8 tester för SPSD-certifikat/listingkrav och UTF-8/mojibake/dubbelkodning, befintliga koder, full stockvärdering, brokerkonsistens och okända marknader. |
| tests/marketCalendar.test.mjs | Helger, helgdagar, halvdagar, DST och senaste avslutade session. |
| tests/snapshotWorker.test.mjs | Strikt totalsumma, källverifiering, tidsguarder och providerfel. |
| tests/brokerTimeDiagnostics.test.mjs | 7 tester för tids/sessiondiagnostik: raw/normaliserad tid, fönster/delta, alla felorsaker, logg/dry-run, halvdag/DST. |
| tests/listedProductRouting.test.mjs | 35 tester för Avanza/Nordnet-certifikat/ETP, Yahoo saknad .ST, identitet, fallback, timestamp, halvdag/DST och hel snapshotblockering. |
| tests/fundProviderRouting.test.mjs | Avanza/Nordnet-ordning, namespace, ISIN, stale/future NAV, fallback, diagnostics och cacheisolering. |
| tests/providerHttpDiagnostics.test.mjs | HTTP-resultat/loggar, identity/cache, FX/fondfel och bortfiltrering av secrets/body-gränser. |
| tests/snapshotEndpoint.test.mjs | Faktisk handler med mock-SDK: auth, dry-run, skrivfönster, skip och fortsättning. |
| DASHBOARD-FEATURE.md | Tidigare featureguide, uppdaterad om cloud/manual och inaktiv worker. |
| SERVER-SNAPSHOTS.md | Denna implementerings-, SQL-, deployment- och testguide. |
