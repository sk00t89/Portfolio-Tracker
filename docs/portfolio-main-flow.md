# Huvudflödet – lokal leverans 10 oktober 2026

> Senare valuta-, kursarkiv- och pilotstatus finns i [Slutkontroller inför pilot](portfolio-pilot-final-checks.md). Den rapporten ersätter äldre uppgifter om saknad SEK-avräkning och antal tester här.

Detta är aktuell status för den enkla startvägen och kompletterar den tidigare instrumentmatrisen och pilotplanen i `portfolio-pilot-readiness.md`. Ingen äldre transaktionshistorik krävs. Alla portföljtester och databasändringar i denna etapp gäller isolerad lokal Docker med syntetiska uppgifter. Ingen produktionsdatabas, verklig portfölj eller driftsättning har berörts.

## Genomförd kedja

1. Befintliga Avanza-/Nordnet-innehavsparser används. Daterade nuvarande fondandelar, exempelvis för Lysa, kan läsas direkt med `Konto;ISIN;Namn;Antal;Valuta;Datum`. Detta är ett kompletterande format, inte ett påstående om stöd för en ännu osedd native Lysa-export.
2. Konto, datum, instrumentidentitet och separat kassa per valuta stäms av. Saknade uppgifter blir begripliga frågor. Granskningen visar varje kontos innehav och kassa innan bekräftelse. Saknat GAV blockerar inte starten, men komplett öppningsvärdering krävs.
3. Första bekräftelsen skapar en verifierad öppningsbalans inklusive kassa. Avkastningen börjar på 0 %, oberoende av tidigare GAV. Importkvittot förhindrar att samma import skapar fler journalposter. En ändrad export måste stämmas av, inte användas för att gissa affärer.
4. Köp, försäljning och kapitalflöden uppdaterar journal, kassa och revision atomiskt. Grundflödet för kända innehav har antal, pris och datum; konto och valuta är kända. Courtage och finansiering frågas när underlaget kräver det. Native GAV följer verkliga köp inklusive kända avgifter; delvis försäljning behåller kvarvarande GAV.
5. Den lokala tjänsten samlar och arkiverar uttryckligen daterade syntetiska kursobservationer. Historikjobbet kör med tjänsteidentitet utan användarsessioner. `npm run local-test:history-job` kör samma kärna fristående; den lokala API:n kör också en periodisk bakgrundsprocess. Inget molnjobb har aktiverats.
6. Arkivet har beständiga aktuella observationer och oföränderliga källversioner i befintlig lokal marknadsdatacache. Om en kurs rättas får berörda portföljer nya revisioner, äldre värderingar behålls och inaktuellt kursunderlag får inte publiceras. Rättad öppningskurs kräver ny avstämning; öppningsbalansen ändras inte tyst.
7. Grafen jämför med verkliga OMXS30 och S&P 500. S&P 500 räknas till SEK med historisk ECB USD/SEK. Båda kurvorna börjar på 0 % från samma faktiskt tillgängliga datum. Exakt TWR kräver tillräcklig flödesvärdering; annars visas Modified Dietz som uppskattning. Prisindex och portfölj inklusive utdelningar har tydligt olika utdelningsbas.
8. Saknade kurser, fondpubliceringar eller valutaunderlag blockerar ofullständig värdering. Helgöverföring behåller ursprungligt källdatum och kräver verifierad kalender. Inga kurser extrapoleras utanför de daterade testobservationerna. Period och index sparas per användare vid navigation och omladdning. Mobilvyn har kontrollerats vid 390 × 844; dashboard har en innehavsöversikt.

## Verkliga publika källor – verifierat och kvarvarande

`pilot-public-market-audit.json` innehåller fem identitetskontrollerade senaste fond-NAV. `pilot-public-listed-audit.json` innehåller 24 daterade börsobservationer: sju aktier, sexton certifikat och TO7. Totalt hittades senaste daterade observationer för de 29 unika instrumenten i underlaget. Granskningen använder endast publika instrumentmetadata, inga antal, GAV, konton eller portföljvärden. Uppgifterna har inte importerats i någon användarportfölj.

Detta är **inte** bevis för obruten framtida tillgänglighet, äldre historiska serier, alla fondkalendrar eller ett produktionsklart instrumentregister. Aktiernas exakta ISIN/noteringskoppling måste slutgranskas. Certifikat har identitets-, valuta-, handelsplats- och tidskontroll av produktens egen kurs; underliggande kryptospot används aldrig som ersättning.

Investor B:s klass B-ISIN SE0015811963 bekräftas av [emittentens splitmeddelande](https://news.cision.com/investor/r/investor-ab-executes-share-split-and-decides-on-record-date%2Cc3341241). Nordnet-exporten saknar ISIN och mappningen behöver fortfarande bekräftas vid onboarding. TO7:s ISIN och lösenperiod 10–24 maj 2027 finns i [Dicots emissionsfolder](https://www.dicotpharma.com/media/l4lhxfet/dicot-pharma-emissionsfolder.pdf). Den nya insamlings-/arkivkärnan kan hantera verifierade optionskurser före en uttrycklig granskningsgräns; därefter krävs avstämning av bolagshändelsen. Lösen/förfall är inte färdigintegrerat och får aldrig ersättas med en påhittad nollkurs.

En gemensam insamlingskärna för verkliga publicerade kurser/NAV är implementerad och testad med injicerade syntetiska leverantörer och arkiv. Den deduplicerar instrument över portföljer och bevarar källdatum/proveniens. Den lokala databasen accepterar fortsatt endast det syntetiska testarkivet. Verkliga kurskällor har endast lästs i separata publika kontroller; en beständig verklig insamlare och schemaläggning är ännu inte aktiverade.

## Kontroller

- 332 enhetstester passerar. Lint, vanligt build och lokaltest-build passerar; befintlig varning för stor JavaScript-bundle kvarstår.
- Lokalt core-DB-test: två separata Auth-användare, RLS, behörigheter, konkurrerande revisioner, idempotens och atomisk rollback.
- Nytt startflödestest: två nya syntetiska användare, sex innehav, tre konton och fyra kassaposter, öppningsvärde 7 200 SEK. Fondandelar och certifikat ingår utan äldre transaktionsfiler. Köp, försäljning och insättning handkontrolleras; historik skapas efter utloggning.
- Kursrättelse-test: båda berörda användarna räknas om, journal/kassa och gamla värderingsversioner bevaras, omstart behåller rättad källa, inaktuellt publiceringsunderlag avvisas. Fel i en kursbatch återställer hela batchen och dess revisionsändringar. Rättad öppningskurs kräver avstämning. Legacy-innehav/snapshots har oförändrade kontrollsummor.
- HTTP-test: främmande origin och icke syntetisk fil avvisas, klienten kan inte välja annan användare, återimport ändrar inte journal/historik.
- Grafkontroll: samtliga åtta registrerade syntetiska demonstrationsanvändare jämförs med båda verkliga indexen och historisk valuta, gemensamt basdatum och 0 %-punkt. GAV efter rättelse är handkontrollerat till 79,5 SEK och kvarvarande GAV efter delvis försäljning till 40 SEK.
- Fristående serverjobb fungerar utan webbläsarsessioner och hoppar över redan sparade observationer. Alla DB-skript kontrollerar uttryckligen projektmarkör, loopback-API 55321 och Docker-databas 55322 innan åtgärder.

## Hinder innan din portfölj kan aktiveras

1. Verklig delad kursarkivering och schemaläggning ska anslutas i separat staging. Källa, villkor, publiceringskalendrar, sena NAV och leverantörsfel måste provas över flera verkliga handelsdagar. Fondkalender får inte gissas från svensk aktiekalender. Versionshantering av rättade valutakurser behöver motsvarande prov som kursrättelserna.
2. Automatisk SEK-växling vid USD-affärer saknar komplett integration med faktiskt mäklarbelopp. Handel ur redan avstämd USD-kassa stöds, men ECB får inte användas som gissad avräkningskurs. Native GAV fungerar; SEK-GAV visas som okänt efter sådant köp när faktisk SEK-anskaffningskostnad saknas. Detta är en pilotblockerare för automatisk växling, inte en anledning att begära gamla transaktioner.
3. Verifierat serverregister för de verkliga instrumenten, Nordnet-mappningar och eventuella aktuella Lysa-klasser måste färdigställas. TO7 och andra bolagshändelser behöver säker avstämning när de inträffar. Stöd för en direkt daterad andelslista finns; verkligt Lysa-beskedsformat har ännu inte lämnats/verifierats.
4. Separat staging, additiv produktionsmigration, backup och fullständigt återställningsprov återstår. RPC-rollback är testad men ersätter inte backup/restore. Lokala RPC:er får inte produktionsaktiveras genom att bara ta bort miljöspärren.

## Säker aktiveringsordning och beslut

Fortsätt först lokalt med kvarvarande valutahantering och källkalendrar. Granska därefter konkret stagingkonfiguration och migration. Följ backup-/restore- och tvåanvändarplanen i `portfolio-pilot-readiness.md`; håll pilotlistan tom och legacy-data orörda tills alla kontroller passerar. Kör en syntetisk skuggpilot med verkliga marknadsdata i staging före din portfölj.

Inför faktisk start behöver du bekräfta vilka konton som ska ingå samt samma daterade innehavs-/kassabesked, inklusive uttrycklig nollkassa där det stämmer. Det är en enkel startavstämning, **inte** en begäran om gamla transaktioner. Om Lysa ska ingå behövs aktuell andelsklass/ISIN, antal och kassa. För USA-affärer behövs valet mellan faktisk valutakassa och mäklarens automatiska växling.

Först när kvarvarande kontroller är klara läggs ett separat godkännande fram för exakt produktionsmigration, backup, pilotanvändare och aktiveringsdag. Därefter kan första öppningsbalansen skuggberäknas och granskas innan grafen visas. Kill switch ska återgå till befintlig vy utan att radera journalen. Inget godkännande till produktion eller verklig import är förutsatt här.
