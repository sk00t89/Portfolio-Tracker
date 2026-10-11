# Förslag: isolationstest av grundmigrationen

**Inte godkänt för körning ännu.** Endast `vutjthqlgzokeylaxpzp`,
`https://vutjthqlgzokeylaxpzp.supabase.co`. Inga molnanrop har gjorts när detta
paket förbereddes. Inga schemaändringar, migreringar, riktiga data eller jobb ingår.

## Innan något skapas

Verifiera dashboardens namn och ID. Kör därefter den läsande filen
[isolation-catalog.readonly.sql](isolation-catalog.readonly.sql) efter godkännande.
Den kräver tre RLS-tabeller och exakt de tre installerade funktionerna, utan
överlagringar, rätt ägarpolicyer, nekade klientskrivprivilegier och oförändrad
automatisk RLS. Jämför även funktionskroppar och eventtriggers mot sparad
migrationsgranskning. Auth och de tre tabellerna ska fortfarande vara tomma.
Avvikelse stoppar testet; inga skydd ska lättas eller nya RPC:er installeras.

## Skapande och testdata

Skriptet [stagingIsolation.mjs](../../scripts/stagingIsolation.mjs) skapar två
tillfälliga Auth-användare via stagingprojektets Admin API. Adresserna är
`isolation-a-<run-id>@portfolio-test.invalid` och motsvarande `b`. Lösenorden
slumpas separat och finns endast i processminnet. `email_confirm:true` gör att
inga bekräftelsemejl skickas. En serveradministrerad `app_metadata`-markör
knyter varje konto till just denna testkörning.

Varje användare loggar in via vanliga Auth API:t och får en separat klient med
egen JWT. Testet verifierar issuer, användar-ID och rollen `authenticated`;
Supabase verifierar signaturen. Administratörsklienten används endast för att
skapa fixtures, läsa kontrollbilder och städa. Dess privilegier ska aldrig
beskrivas som användarisolerade: `service_role` kringgår RLS avsiktligt och måste
stanna på servern.

För varje konto skapas en baseline, en journalhändelse och en observation.
JSON innehåller en unik syntetisk markör; inga verkliga instrument, belopp eller
portföljvärden används. Journaltriggern ska höja revisionen till 1 och
observationen använder samma revision. Detta testar lagringsisolering, inte TWR.

## Acceptanskrav

1. A och B får exakt en egen rad per tabell vid ofiltrerad läsning. Filter på den
   andra användarens ID ger tom lista.
2. Läs-RPC ger enbart rätt markörer, en egen händelse och observation, revision 1.
   Försök att skicka den andra ägarens ID som RPC-parameter nekas: RPC:n har inga
   parametrar. Anonyma får varken tabelläsning eller läs-RPC.
3. För anonym, A och B provas INSERT, UPSERT, UPDATE och DELETE mot båda ägarna
   i alla tre tabeller: totalt **72 skrivförsök**. Varje försök måste ge
   PostgreSQL `42501`. Constraintfel, utgångna JWT eller nätfel är inte godkända
   säkerhetsresultat. Servicekontroll före/efter bekräftar oförändrade rader och
   revisioner efter dessa försök.
4. Den interna revisionstriggerfunktionen ska inte vara åtkomlig som klient-RPC.
   Lokala journal/import/publicerings-RPC:er ska inte finnas i staging.
   `PGRST202` visar en saknad tillgänglig RPC-signatur, inte ensam att inga
   skrivvägar finns; därför är kataloggranskningen före/efter obligatorisk.
   `rls_auto_enable` är separat granskad som DDL-eventtrigger och lämnas orörd.
5. Katalog, funktionsdefinitioner, policyer, rättigheter och eventtriggerlista
   ska vara identiska efter testet. Ingen skriv-RPC eller policy läggs till.

## Städning, inklusive fel och avbruten körning

En Git-ignorerad körningskvittens i
`artifacts.local/staging-isolation-receipt.json` sparar projekt-ID, körnings-ID,
testadresser och skapade användar-ID:n, aldrig lösenord, nycklar eller JWT.
Avsedda adresser sparas före skapandet så en avbruten create kan identifieras.

Efter avslut eller testfel avbryts fler testförsök och klienterna loggas ut
lokalt. Städningen kontrollerar **båda** testidentiteterna innan radering:
exakt ID/adress, domänen `.invalid` och rätt serveradministrerad körningsmarkör.
Om ett ID inte hann sparas måste exakt adress och markör matcha innan det används.
Oväntade användare eller markörer stoppar automatisk städning för granskning.

Endast dessa två uttryckligen disponibla testkonton hårdraderas via Admin API.
Godkända främmande nycklars kaskadradering tar då bort deras sex testposter.
Kontrollera därefter noll kvarvarande Auth-användare och testposter och markera
kvittensen som städad. Inga schemaobjekt tas bort. Vid nätfel behålls kvittensen;
en separat godkänd `--cleanup-approved` kan återuppta samma begränsade städning.
Ingen generell rensning, TRUNCATE eller radering av andra konton används.

## Körning efter ditt godkännande

`node scripts/stagingIsolation.mjs --plan` är säker offlineförberedelse.
`--run-approved` skapar konton och data och får **inte** köras nu. Flaggan är ett
skydd mot misstag, inte ett ersättande godkännande. Kataloggranskningen är ett
manuellt obligatoriskt steg; HTTP-skriptet kan inte själv läsa systemkatalogen.

Efter godkännande behövs stagingprojektets publika nyckel och servernyckel i en
tillfällig, privat processmiljö: `PORTFOLIO_STAGING_URL`,
`PORTFOLIO_STAGING_ANON_KEY`, `PORTFOLIO_STAGING_SERVICE_KEY`.
Skriptet läser aldrig `.env.local` eller produktionskonfiguration. Alla HTTP-anrop
är låsta till det exakta stagingursprunget och redirects nekas. Nycklar ska inte
skickas i chatten eller sparas i Git/frontend. Om säker nyckelåtkomst saknas
behöver ägaren ange dem lokalt; ingen inloggningssession extraheras ur webbläsaren.

**Godkännandet som behövs omfattar:** läsande katalogkontroll före/efter,
skapande av de två tillfälliga kontona och sex syntetiska posterna, ovanstående
API-tester samt avgränsad radering av exakt dessa fixtures och kontroll av städning.
Det omfattar ingen senare migration eller aktivering.

## Vad som verifierats under förberedelsen

Sju offline-tester av transportlåset, tokenkontroller, felkoder, städningsidentitet
och testskriptets förmåga att upptäcka simulerade läckor passerar. Lint passerar.
Den läsande katalogfilen har också körts framgångsrikt i den tidigare lokala
scratchdatabasen med grundmigration och automatisk RLS, inom READ ONLY/ROLLBACK.
Detta är inte ett genomfört isolationstest i Supabase-staging.
