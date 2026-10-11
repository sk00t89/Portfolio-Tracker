# Lokal CSV-import och journalhistorik – leverans 2026-10-10

## Säkerhetsgräns

All SQL och alla portföljskrivningar körs enbart i Dockerprojektet `portfolio-performance-local-test`: API `http://127.0.0.1:55321`, PostgreSQL port `55322`, databasmarkör `portfolio_tracker.test_only=true`. Skripten kontrollerar projektidentitet, container och port före körning. Servern binder bara loopback och vägrar främmande webboriginer. Service-nyckeln lämnar inte serverprocessen. Testappen kan inte ansluta till befintligt Supabase-projekt. Dess portföljfiler kontrolleras mot exakt godkända syntetiska demofiler före import. Inga verkliga portföljfiler, användardata, produktionsskrivningar eller driftsättningar ingår.

## Fungerande flöde

1. Tom syntetisk användare väljer Avanza/Nordnet-innehav, komplett Lysa-andelsunderlag och separat kontobesked på Import.
2. Befintliga brokerparsers används. CSV/TSV hanterar citerade namn, decimaltecken och saknade tal utan att ersätta dem med noll. Konto, datum och instrument som saknas stäms av med enkla frågor. Saknad kassa måste anges, även om den är noll. Konton i kassafilen utan innehavsfil måste uttryckligen bekräftas som enbart kassa eller uteslutas. Användaren bekräftar komplett kontoomfattning.
3. Servern värderar öppningsbalansen med daterade kurser/NAV och valuta. Innehav, kassa och importkvitto sparas atomiskt. Grafens avkastning börjar på 0 %, oberoende av GAV. Öppningspriset används aldrig som anskaffningspris.
4. Köp/sälj från Innehav har förvalda instrument, konto, valuta och finansiering från befintlig kassa. Antal, pris och datum är huvudfält; datum är idag. Okänd avgift leder till en kort nödvändig fråga. Avgifter och annan finansiering finns under Avancerat.
5. Daterad affärsfil med stabila referenser importeras separat. Återimport av samma fil och överlappande affärsreferenser skapar inga dubbletter. Om en identisk manuellt registrerad affär saknar brokerreferens ställs en fråga: koppla till befintlig affär eller bekräfta att det är en separat affär. Kopplingen tillför referensen atomiskt utan att ändra antal eller kassa. Motstridiga referenser stoppas. Senare innehavsexporter stäms av mot journalen; skillnader får aldrig skapa gissade affärer eller skriva över startbalansen.
6. Insättning, uttag, utdelning, ränta och avgift kan registreras i SEK. Rättelse av antal/pris/datum/avgift är atomisk, revisionssparad och räknar om historiken. Journal, kassa och revision rullas tillbaka tillsammans vid fel.
7. En serverprocess kör var 60:e sekund oberoende av webbläsarsession. Den sparar avslutade kalenderdagar från öppningsdatumet till igår, inklusive kassa, positioner och historisk FX. Värderingens tidsgräns är 23:59:59.999 Stockholm; kursunderlaget använder redan avslutade handelsdagar. Körningen är idempotent, låser revisionen, sparar körstatus och kan återförsökas. Tidigare revisionsversioner behålls. En misslyckad ofullständig batch publiceras inte delvis.
8. Kurscache delas mellan användare och samtidigt efterfrågad marknadsdata hämtas en gång. Bara verifierade lyckade svar cachas. Aktiekalendrar hanterar helger, helgdagar, halvdagar och tidszoner för granskade år. Äldre publicerade observationer behåller sitt verkliga källdatum och markeras som senaste publicerade; inga nya börskurser skapas för stängda dagar.
9. OMXS30 och S&P 500 använder publikt hämtade historiska indexkurser. S&P 500 räknas om med daterade ECB USD/SEK-referenser. Portfölj/index använder samma tillgängliga datum och nollpunkt; period- och indexval behålls vid navigation och omladdning. Dashboard har en innehavsöversikt. Prisindexets avsaknad av utdelningar och ECB-referensens skillnad mot samtidig USA-stängning redovisas.

## Beräkningsgränser

Portföljkurser, fond-NAV och portfölj-FX i demonstrationen är **uttryckligen syntetiska**. Index och index-FX är verkliga publika observationer. Demonstrationen ska aldrig beskrivas som validering av en verklig portfölj.

Exakt TWR används för intervall utan externa flöden och när verifierade före/eftervärderingar finns vid varje flödes faktiska tidpunkt. Servermotorn har en separat adapter för faktisk intradagsvärdering; dagsstängningskurser får inte användas som sådana. Datum utan tid eller oklart förhållande till andra affärer ger tydligt märkt daglig Modified Dietz. Vid saknat avgifts-/kassaflödesunderlag stoppas värderingen. Den lokala ordinarie marknadsadaptern har inga intradagsflödeskurser och ger därför Dietz vid externa flöden.

GAV från öppningsimporten är separat metadata. Nästa pilotetapp har kompletterat journalvyn med genomsnittlig kostnadsbasis för köp/försäljningar och rättelser. Verklig SEK-anskaffningskostnad vid utländska köp behöver fortfarande verifieras; historisk värderings-FX ersätter inte broker-FX. Se `portfolio-pilot-readiness.md` för aktuell stödmatris och avgränsningen till en ny öppningsbalans utan äldre transaktionsimport.

## Förberett men inte aktiverat för riktiga portföljer

- `historicalPortfolioMarket.js` återanvänder verifierade historiska aktiestängningar och hämtar historisk ECB-valuta. Ett serververifierat instrumentregister krävs. Okänd handelsplats/identitet/kalenderår stoppas.
- Historiskt fond-NAV kräver en daterad verifierad NAV-källa. En dedikerad adapter kan injiceras; aktuell NAV från befintlig fondtjänst får inte backfyllas. Leverantör, publiceringstid, täckning och användningsvillkor behöver verifieras för respektive fond/Lysa-fond.
- Den nya affärsfilen har ett explicit normaliserat format. Universellt stöd för varje Avanza/Nordnet-transaktionsexport är **inte** verifierat. Deras verkliga formatvariationer, avgifter, referenser, kontotyper och bolagshändelser behöver granskas med anonymiserade/syntetiska motsvarigheter innan aktivering.
- Externa valutaflöden behöver serververifierad historisk FX. Lokal kassahändelse-RPC begränsar därför externa flöden till SEK. Valutaväxling, depåöverföring, split, fusion, inlösen och andra bolagshändelser kräver färdig registrerings-/importintegration; befintlig ren replaymotor är inte ett komplett brokerimportstöd.
- Portföljer med noll startvärde, total kapitalförlust eller långvariga luckor kan inte få en obruten avkastningskedja utan särskild avstämning.
- Längre historik än 4 oktober kan börja från en äldre verifierad öppningsbalans plus alla efterföljande affärer, externa flöden, utdelningar, kostnader, bolagshändelser och historiska priser/NAV/FX. Dagens innehav/GAV eller gamla totalvärdessnapshots räcker inte. Inget sådant verkligt underlag har importerats i testmiljön.
- Produktionsscheduler, övervakning, nyckelhantering, leverantörsbudgetar och periodindelad körning av fleråriga portföljer behöver färdigställas och granskas i separat staging. Den lokala processen kör bara medan testservern är igång; den är ingen installerad produktionstjänst.

## Lokal reproduktion

```powershell
npm run local-test:setup
npm run local-test:history-setup
npm run test:local-history
npm run local-test:api
# I en annan terminal:
npm run local-test:ui
```

API och UI startas separat; UI finns på `http://127.0.0.1:55800`. `node scripts/prepareLocalCsvDemo.mjs` lägger till en tom syntetisk demoanvändare. Demofiler går att hämta på Import och läsa med filväljaren. Det äldre core-testet är `npm run test:local-db`; det skriver sin egen syntetiska användarlista, så kör CSV-testet efteråt om CSV-demonstrationen ska visas.

## Test och säkerhetskontroller

Leveranskontrollerna är gröna: **316 enhetstester**, lint, ordinarie build och lokaltestbuild. Båda byggena har en varning om en större JavaScript-bundle, men inga byggfel. `npm run test:local-db` passerar äldre journalregressioner för RLS, samtidiga skrivningar och rollback. `npm run test:local-history` passerar CSV-/historiktesten med tre separata Auth-användare. `node scripts/testLocalImportApi.mjs` passerar HTTP-kontrollerna och `node scripts/checkLocalPerformanceGraph.mjs` verifierar både OMXS30 och S&P 500 mot samtliga fyra aktuella syntetiska demoportföljer.

Databastesterna använder olika konton, återimport, överlappande referenser, manuell affär följd av CSV, rollback av hel import, rättelser i efterhand, bibehållna gamla observationer, insättningar/uttag, okänd tidpunkt, felaktig tidszon, kapitalflöde efter 23:30 och otillräcklig kassa. Import/run/rättelse-tabeller tillåter bara ägarens läsningar. Direkta skrivaråtgärder, cacheläsning och worker/import-RPC nekas browserrollen. HTTP-testet blockerar icke godkända portföljfiler och främmande webborigin samt verifierar att klienten inte kan välja en annan användares identitet. Hash över befintliga lokala legacy-innehav och snapshots är oförändrad efter testerna. Enhetstester verifierar dessutom saknade NAV/valutakurser, citerad CSV, konton med enbart kassa, okända avgifter/kassa, cacheåteranvändning och exakt flödesvärdering med uttryckliga testobservationer.

Webbläsardemonstrationen har gått från tom användare via avstämd CSV till ett manuellt köp, följt av en affärsimport som kopplar det befintliga köpet och lägger till försäljningen. Nästa återimport visar uttryckligen att inga dubbletter skapats. Portfölj/index-grafen fungerar efter affärerna och 1M samt S&P 500 behålls vid både navigation och siduppdatering.

## Säker plan för verklig aktivering

1. Granska anonymiserade format och konto-/instrumentmappning samt verifiera historiska kurs/NAV/FX-källor och fullständigheten i transaktionsunderlaget. Bestäm dokumenterat första datum som faktiskt kan rekonstrueras.
2. Kör motsvarande kedja i separat staging med syntetiska motsvarigheter för samtliga instrument/bolagshändelser; validera TWR/Dietz mot oberoende handräkning. Granska RLS, RPC-rättigheter, backup/återställning och journal-/importrevisionsregler. Anpassa **inte** de lokala test-RPC:erna genom att bara ta bort säkerhetsmarkören.
3. Presentera exakta produktionsmigrationer, leverantörer, jobb, kostnader, funktionsflagga och återställningsplan för användarens **separata uttryckliga godkännande**. Ingen produktionsmigration eller verklig dataimport sker före detta.
4. Efter godkännande: separat backup, additiva tabeller, avgränsad användarflagga och dokumenterad avstämning av innehav/kassa/öppningsvärde. Behåll legacy-data orörda. Kör återuppbyggnad utan publicering och jämför resultat före nästa godkända aktiveringssteg.
5. Aktivera först för avtalad portfölj, övervaka saknade observationer, revisionsändringar och jobb-fel. En avstängningsflagga ska kunna stoppa nya publiceringar utan att radera journal eller tidigare historik.
