# Automatisk RLS: granskning och ändringsförslag

Granskning 2026-10-11. Endast läsande SQL kördes i `vutjthqlgzokeylaxpzp`,
`portfolio-tracker-staging`. Ingen molnfunktion, trigger eller behörighet ändrades.
Det ursprungliga godkända utkastet `001-foundation.approval.sql` är oförändrat.

## Observerat i staging

| Egenskap | Resultat |
| --- | --- |
| Funktion | `public.rls_auto_enable()`, inga argument, returtyp `event_trigger`, språk `plpgsql` |
| Ägare | `postgres` |
| Säkerhet | `SECURITY DEFINER`, `search_path=pg_catalog` |
| ACL | `NULL`, standardrättigheter; EXECUTE är sant för `anon`, `authenticated`, `service_role` |
| Eventtrigger | `ensure_rls`, ägare `postgres`, aktiv (`O`), `ddl_command_end` |
| DDL-taggar | `CREATE TABLE`, `CREATE TABLE AS`, `SELECT INTO` |
| Funktionens kropp | MD5 `c44fb229ea8a6b0afd04a0a33261c16c` |
| Beroenden | Språk `plpgsql`, schema `public`; `ensure_rls` refererar funktionen |
| Radtriggers | Inga |

Definitionen läser skapade tabeller från `pg_event_trigger_ddl_commands()`,
begränsar åtgärden till `public` och aktiverar RLS med korrekt citerade schema-
och tabellnamn (`%I.%I`). Den skapar inga policyer och ger inte nya datarättigheter.
Returtypen är en eventtriggerfunktion. Ett vanligt `SELECT` kan inte returnera
typen `event_trigger`. Lokalt verifieras även ett anrop via `PERFORM`: det
avslutas utan tabelländring utanför DDL-kontext eftersom denna version fångar
kontextfel. EXECUTE-rättigheten ska därför inte beskrivas som att alla direkta
anrop är blockerade. Den ger inte klientroller rätt att skapa tabeller.

Detta stämmer med Supabases [dokumenterade automatiska RLS-mekanism](https://supabase.com/docs/guides/database/postgres/event-triggers#example-trigger-function---auto-enable-row-level-security).
Vi kan verifiera mekanismen men inte i efterhand bevisa vem som klickade i
projektets skapandeformulär. Den observerade versionen är inte byteidentisk med
dokumentationens exempel: den slår upp tabellnamnet via OID och citerar två
identifierare, samt loggar fel utan att kasta dem vidare. Grundmigrationens
uttryckliga RLS-satser behålls och måste lyckas för att migrationen ska committas.
Det finns ingen identifierad konflikt med våra tre tabeller eller policyer.

## Exakt föreslagen ändring

Det nya, separat godkännandepliktiga utkastet är
[001-foundation.auto-rls.approval.sql](001-foundation.auto-rls.approval.sql).
Endast funktionsdelen i tomhetskontrollen får ett `AND NOT COALESCE((...),false)`
undantag. Det kräver samtidigt:

- Exakt namn, inga argument, `event_trigger`, `plpgsql`, ägare `postgres`.
- `SECURITY DEFINER`, exakt sökväg och den observerade ACL-inställningen.
- Exakt observerat fingeravtryck av funktionskroppen.
- Aktiv `ensure_rls` med rätt ägare, händelse, funktion och DDL-taggar.

`COALESCE` gör att saknade metadata, till exempel en borttagen sökväg, inte kan
slippa igenom genom SQL:s NULL-logik. MD5 används för ändringsdetektion mot den
manuellt granskade kroppen, inte som bevis för ursprung eller en kryptografisk
säkerhetsgräns. En annan version kräver ny granskning.

Alla övriga funktions- och tabellkontroller är oförändrade, inklusive det tidigare
undantaget för extensionägda objekt. Namnliknande funktioner och överlagringar
blockeras. Auth måste fortfarande ha noll användare. Migrationens tre tabeller,
policyer, trigger och läsande RPC är exakt samma som tidigare.
Automatiska RLS-funktionen och dess eventtrigger lämnas helt orörda.

## Lokal verifiering

`node scripts/testStagingFoundation.mjs --auto-rls` använder en ny lokal
scratchdatabas och en byteexakt kopia av den observerade funktionen från
`tests/fixtures/staging/rls-auto-enable.observed.sql`. Ingen molnanslutning används.
Det testar undantaget tillsammans med den aktiva eventtriggern, ändrad kropp,
ACL, saknad sökväg, avstängd trigger, oväntad funktion och överlagring. Befintliga
tabeller och Auth-användare måste fortfarande stoppa installationen.
Injicerat fel provas med full rollback och bevarad automatisk RLS-funktion.
Installation, stopp vid omkörning, två ägares RLS/rättigheter och revisioner
provas som tidigare. Den befintliga lokala portföljdatans fingeravtryck jämförs.

Både originalrepetitionen och `--auto-rls` passerade. Lint och tre befintliga
säkerhetsregressioner passerade. Ingen appkod eller buildkonfiguration ändrades.

Detta godkänner ingen molnkörning. Invänta ägarens nya uttryckliga godkännande för
det justerade utkastet och kontrollera sedan målprojekt och metadata igen.
