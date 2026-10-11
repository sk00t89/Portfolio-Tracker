# Staging: beslutsunderlag för första migrationen

Målprojekt: **vutjthqlgzokeylaxpzp**, endast
**https://vutjthqlgzokeylaxpzp.supabase.co**.
Ägaren uppger Stockholm / eu-north-1, Free och ett tomt projekt.
En läsande kontroll av `/auth/v1/health` gav HTTP 401 utan nyckel.
Det bekräftar en svarande API-adress, men verifierar inte region, plan,
projektägare eller databasens innehåll. Ingen autentiserad molnåtkomst har gjorts.

## Exakt vad första steget ändrar

Hela SQL-underlaget finns i [001-foundation.approval.sql](001-foundation.approval.sql).
Det är ett godkännandeutkast utanför automatiska migrationer, inte en instruktion
att köra `supabase db push`. Det återanvänder den granskade grundmodellen utan
att flytta de lokala runtime-funktionerna till molnet.

- Tre nya tabeller i `public`: `portfolio_performance_baselines`
  (öppningsbalans, revision, avstämningsstatus), `portfolio_ledger_events`
  (journal med dubblettskydd), `portfolio_performance_observations`
  (daterade värderingar per revision).
- Primärnycklar, främmande nycklar mot Auth/öppningsbalans, unikhetsvillkor
  och datakontroller enligt SQL-filen. Radering av en Auth-användare kaskadraderar
  dess nya portföljdata; detta måste ingå i kommande backup- och raderingstester.
- RLS och tre ägarpolicyer: inloggade får endast läsa egna rader.
  Anonyma får ingen åtkomst. Klienter får inga direkta skrivrättigheter.
  `service_role` får tabellrättigheter och måste stanna på servern.
- En läsande RPC `get_portfolio_performance_input()`, med anroparens RLS.
- En intern triggerfunktion `invalidate_performance_coverage()` och trigger
  `performance_journal_changed`: journaländring höjer revision och återställer
  avstämningsstatus. Funktionen har låst sökväg och kan inte anropas av klienter.

Inga portföljrader eller användare skapas av migrationen. Inga befintliga
tabeller, innehav, snapshots, Auth-inställningar, schemaläggare eller appfunktioner
ändras. Inga Edge Functions eller webbappar driftsätts. Journalens skriv-RPC,
import, marknadsarkiv och automatisk historik ingår **inte** i detta första steg;
de kräver ett senare separat migrationsunderlag och godkännande.

## Skydd och genomförande efter godkännande

1. Kontrollera att dashboarden visar exakt projekt-ID ovan och Stockholm/Free.
   Stäng andra projekts SQL-flikar. Inga produktionsnycklar eller länkar används.
2. Efter uttryckligt godkännande: kör endast den godkända SQL-filen i detta
   projekts SQL Editor. SQL är en enda transaktion och stoppar om Auth har
   användare eller `public` har applikationstabeller, vyer, sekvenser eller
   funktioner (extensions undantas). Den ska även stoppa vid omkörning.
3. Läs tillbaka tabeller, policyer och funktionsrättigheter. Skapa därefter,
   först inom godkänt testscope, två syntetiska testanvändare med riktig
   Supabase Auth och verifiera isolation. SQL-stubbtestet ersätter inte detta.
4. Förbered nästa separat granskade migrationssteg för syntetisk import,
   atomiska affärer/kassa och historik. Behåll jobb avstängda och den befintliga
   appens lokala skydd intakta tills en separat stagingtransport är verifierad.

**SQL kan inte själv styrka ett Supabase-projekt-ID.** Kommentaren i filen är
ingen säkerhetsgräns. Projektspecifik dashboardkontroll är obligatorisk;
tomhetskontrollen är ett extra skydd, inte ett alternativ till identitetskontroll.
Inga molnkommandon, inloggningar eller nycklar behövs för den lokala förberedelsen.
Skicka inte nycklar eller databaslösenord i chatten.

## Lokala bevis och återställning

`node scripts/testStagingFoundation.mjs` kör just utkastet i en ny scratchdatabas
i den kontrollerade lokala Docker-miljön. Det provar stopp vid befintliga Auth-rader
och applikationstabell, injicerat SQL-fel med full rollback, installation,
stopp vid omkörning, två syntetiska ägaridentiteter, RLS/rättigheter och
revisionstrigger. Den befintliga lokala portföljdatans fingeravtryck jämförs.
Auth är en minimal SQL-stubb; hanterad moln-Auth och molnbackup återstår.

Före körning bekräftas tomt mål med SQL-kontrollerna. Ett fel under installationen
rullar tillbaka hela transaktionen. Efter lyckad installation görs ingen
automatisk destruktiv återställning: lämna tabellerna och stäng av användning.
När syntetisk data väl lagrats behövs separat backup med återläsning till ett
annat godkänt mål innan ytterligare migrationer. Lokalt finns redan en separat
backup/restore-repetition; Free-projektets molnåterställning är inte verifierad.

Produktion, riktiga portföljer och betaldata omfattas inte av detta underlag.
