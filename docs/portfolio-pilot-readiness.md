# Säker pilot från en ny öppningsbalans

> Uppdatering: aktuell leverans finns i [Huvudflödet](portfolio-main-flow.md). Den senare etappen har direkt import av daterade fondandelar, ett beständigt syntetiskt kursarkiv, fler publika instrumentkontroller och 332 passerande enhetstester. Instrumentmatrisen och siffrorna nedan beskriver den tidigare granskningen; använd den nya rapporten för aktuell status. Staging-/backupplanen gäller fortsatt.

Granskning: 10 oktober 2026. Endast lokal utveckling och syntetiska portföljtester. Inga produktionsåtgärder, verkliga dataimporter eller schemaändringar har utförts i denna etapp.

## Beslutad avgränsning

Användaren har förtydligat att gamla transaktioner inte ska importeras. Grafen börjar på **0 % vid första avstämda öppningsbalansen**, med befintliga innehav och separat kassa som startkapital. Det betyder inte att portföljvärdet börjar på noll. GAV från innehavsexporten är separat anskaffningsmetadata och påverkar inte avkastningens nollpunkt. Inga påståenden görs om avkastning före starten.

Nya köp, försäljningar, insättningar, uttag, utdelningar och avgifter måste registreras från startdagen. En ny innehavsexport kan upptäcka avvikelser men kan inte avgöra vilken affär eller vilket kapitalflöde som orsakat dem. Då krävs avstämning, inte en gissad journalhändelse. Utländska växlingar, skatt på utdelning, split och teckningsoptioners lösen/förfall behöver färdig integration innan de påverkar en aktiverad pilot.

Detta minskar behovet av gamla kursarkiv: verifierade daterade NAV och kurser kan samlas framåt. Datum utan fullständigt kurs-/NAV-/kassaunderlag ska fortfarande ge ett tydligt vänteläge eller en lucka, inte en fabricerad portföljkurva. Portfölj och index börjar på samma faktiskt tillgängliga datum och 0 %. Första dagslutet måste vara komplett och stämma med det valda kontobeskedets datum; en godtycklig startdag eller gammal CSV utan datum är inte tillräcklig.

## Befintligt underlag

De inklistrade innehavsexporterna har granskats i konversationen. Testdatabasen har inte fått deras antal, GAV, värden eller kontouppgifter. Dokumentet innehåller endast instrumentmetadata och stödstatus.

Avanza: 28 instrument med namn, kortnamn, antal, värde, native/SEK-GAV, valuta, ISIN, marknad och typ. Strukturen stöds av parsern. Konto, exportdatum och separat kassa saknas.

Nordnet: fem innehav i elva kolumner. Antal, native GAV, valuta och värde stöds. SEK-GAV är nu samma som native GAV när valutan är SEK. ISIN, kortnamn, marknad, instrumenttyp, konto, datum och kassa saknas. De fyra namn som också finns hos Avanza är kandidater till mappning, inte automatiskt bevis på samma notering. Investor B behöver egen bekräftad identitet/notering. Totalt finns **29 olika instrumentnamn** i underlaget: sju aktier, fem fonder, sexton certifikat/ETP:er och en teckningsoption.

## Instrument för instrument

ISIN/valuta/marknad nedan kommer från Avanza-underlaget om inget annat anges. Ett ISIN från en CSV är inte i sig ett verifierat serverregister eller ett bevis på historisk kurstäckning.

| Instrument | ISIN | Valuta / handelsplats | Vad som finns och vad som återstår |
|---|---|---|---|
| AbCellera Biologics | CA00288U1066 | USD / XNAS | Historisk aktieadapter finns; publik noteringsidentitet och begärda dagskurser behöver verifieras. Historisk USD/SEK krävs. |
| Palantir Technologies | US69608A1088 | USD / XNAS | Samma förutsättningar; ingen USD/SEK får antas vara 1. |
| Dicot Pharma | SE0011178458 | SEK / FNSE | Aktieadapter finns; rätt notering, täckning och bolagshändelser måste verifieras. |
| Evolution | SE0012673267 | SEK / XSTO | Aktieadapter finns; två konton behålls åtskilda. Nordnet-mappning behöver bekräftas. |
| Latour B | SE0010100958 | SEK / XSTO | Aktieadapter finns; klass B och faktisk notering behöver bekräftas. |
| Plejd | SE0008014476 | SEK / XSAT | Spotlight bekräftar instrumentidentiteten; full historisk dagsserie är inte verifierad i denna etapp. |
| Investor B | Inte angivet | SEK / inte angivet | Nordnet-underlaget behöver kompletteras med bekräftad ISIN, klass B och handelsplats. |
| Avanza Zero | SE0001718388 | SEK / fond | Daterat senaste NAV verifierat live; komplett historisk serie saknas. |
| Kavaljer Quality Focus A SEK | LU1232457504 | SEK / fond | Daterat senaste NAV verifierat live; rätt klass A SEK har officiell dokumentation. Historisk serie saknas. |
| Länsförsäkringar USA Index | SE0002793943 | SEK / fond | Daterat senaste NAV verifierat live; fonden värderas i SEK, inte ytterligare USD-konvertering. Historisk serie/fondkalender saknas. |
| Spiltan Aktiefond Investmentbolag | SE0004297927 | SEK / fond | Daterat senaste NAV verifierat live; historisk serie/publiceringskalender saknas. |
| Swedbank Robur Access Asien A | SE0007074117 | SEK / fond | Daterat senaste NAV verifierat live; rätt klass A. Historisk serie/fondkalender saknas. |
| DICOT PHARMA AB TO7 | SE0029051242 | SEK / FNSE | Historikadaptern blockerar nu denna instrumenttyp tills kurskälla och lösen/förfall/bolagshändelser stöds. En vanlig aktiekurs räcker inte. |
| Valour Arweave SEK | CH1108679304 | SEK / XSAT | Produktadapter finns för aktuell verifierad stängningsobservation; komplett historisk produktserie saknas. |
| Valour Sui SEK | CH1213604601 | SEK / XSAT | Samma begränsning. |
| Valour Avalanche SEK | CH1114178788 | SEK / XSAT | Samma begränsning. |
| Valour Bitcoin Zero SEK | CH0585378661 | SEK / XSAT | Samma begränsning; Nordnet-mappning måste bekräftas. |
| Valour Ethereum Zero SEK | CH1104954362 | SEK / XSAT | Samma begränsning. |
| Valour Gram SEK | CH1161139600 | SEK / XSAT | Samma begränsning; namn/ticker och eventuella namnändringar behöver kontrolleras. |
| Valour Polkadot SEK | CH1114178770 | SEK / XSAT | Samma begränsning. |
| Valour Sonic SEK | CH1108679353 | SEK / XSAT | Spotlight bekräftar ISIN; historisk produktserie saknas. Nordnet-mappning måste bekräftas. |
| Virtune Avalanche ETP | SE0022050092 | SEK / XSTO | Produktadapter finns; komplett historisk produktserie saknas. |
| Virtune Chainlink ETP | SE0021149259 | SEK / XSTO | Samma begränsning. |
| Virtune Crypto Altcoin Index ETP | SE0023260716 | SEK / XSTO | Officiellt produktfaktablad bekräftar ISIN. Historisk SEK-noteringskurs saknas; Nordnet-mappning måste bekräftas. |
| Virtune Staked Cardano ETP | SE0021630449 | SEK / XSTO | Produktadapter finns; komplett historisk produktserie saknas. |
| Virtune Staked Ethereum ETP | SE0020541639 | SEK / XSTO | Samma begränsning. |
| Virtune Staked Polkadot ETP | SE0021148129 | SEK / XSTO | Samma begränsning. |
| Virtune Staked Solana ETP | SE0021309754 | SEK / XSTO | Samma begränsning. |
| Virtune XRP ETP | SE0021486156 | SEK / XSTO | Samma begränsning. |

Certifikat värderas med **den noterade produktens kurs i rätt valuta på rätt marknad**. BTC/ETH/SOL eller annat underliggande spotpris är ingen ersättningskurs. Avgifter, staking, indexombalansering, enhetsfaktorer och skillnad mellan NAV och börskurs gör att kurvorna kan skilja sig. USD-NAV från ett produktfaktablad får inte presenteras som SEK-stängningskurs för noteringen.

Lysa: inga aktuella Lysa-andelsklasser har lämnats i detta underlag. Den befintliga namn/ISIN-katalogen är adapterkapacitet, inte bevis på användarens innehav. Lysa bör inleda med ett daterat andels- och kassabesked; komplett historisk transaktionsfil är inte nödvändig för start framåt, men dagens lokala Lysa-parser rekonstruerar fortfarande andelar från en uttryckligen komplett syntetisk transaktionsfil. En direkt innehavsbasis för Lysa och faktiskt andelsklassunderlag återstår innan pilot.

## Verifierat publikt, och dess begränsningar

`node scripts/auditPublicPilotSources.mjs` läser endast HTTPS hos Avanza, Nordnet och Lysa. Den saknar Supabase-, konto- och Auth-åtkomst. Resultatet finns i `pilot-public-market-audit.json` och får inte tolkas som ett portföljimportresultat.

Livekontrollen 10 oktober hittade fem **identitetskontrollerade senaste NAV i SEK** med befintlig fondadapter: Avanza Zero, Kavaljer, LF USA och Access Asien daterade 8 oktober, Spiltan daterad 9 oktober. Detta bevisar fungerande senaste-NAV-hämtning för dessa fem ISIN, inte daglig äldre historik. Lysa-endpointen innehöll 23 poster med positiva numeriska priser; andelsklass, datum och publiceringskalender behöver separat granskning. Inga av dessa poster har förts in i en användarportfölj eller använts för historisk backfyllnad.

Officiella identitets-/källkontroller:

- [Lysas fondsida](https://www.lysa.se/fonder) beskriver senaste kurser och fonddokumentation. Detta är inte en verifierad API-specifikation för historiska NAV-serier.
- [Avanza Zero hos Pensionsmyndigheten](https://www.pensionsmyndigheten.se/service/fondtorg/fond/734491) bekräftar ISIN och SEK. Historisk fondavkastning får inte ersättas med OMXS30.
- [Kavaljer klass A-dokument](https://funds.carnegroup.com/assets/documents/sef/SEF_%E2%80%93_Kavaljer_Quality_Focus/KIID_-_Class_A_-_LU1232457504-Luxembourg-EN.pdf) bekräftar A, SEK och ISIN.
- [LF USA:s fondlista](https://lf.fondlista.se/sv/1/details/SE0002793943), [Spiltans Fondab-lista](https://spiltanfonder.fondab.com/v2/fund/search) och [Roburs fondlista](https://swedbankrobur.fondlista.se/sv/details/SE0007074117) bekräftar respektive identitet. En avkastningsgraf eller månadsrapport är inte bevis på rå daglig NAV-täckning.
- [Spiltans fondsida](https://www.spiltanfonder.se/fonder) anger att NAV kan avse olika datum beroende på marknadernas helgdagar. Fondkalender får inte ersättas av svensk aktiekalender.
- [Spotlight Plejd](https://indicator.spotlightstockmarket.com/en/companies/irtrade?InstrumentId=XSAT01001575) och [Spotlight Valour Sonic](https://indicator.spotlightstockmarket.com/sv/etp-about?insref=7501763) ger instrumentidentitet. De verifierar inte hela äldre kursserier.
- [Virtunes eget faktablad](https://storage.googleapis.com/virtune-public-bucket/viralt/documents/factsheet-en.pdf) bekräftar Altcoin-produktens ISIN och produktstruktur. Dess USD-NAV är inte den importerade SEK-noteringens kurs.

## Ändrat och testbart lokalt

- Ny ren GAV-replay: känd öppningskostnad plus köp inklusive courtage, viktat med antal. Delvis försäljning minskar anskaffningskostnaden proportionellt och behåller GAV. Försäljningsavgift påverkar kassa/avkastning men inte kvarvarande GAV. Hel försäljning följd av nytt köp startar en ny kostnadsbasis. Rättelser i efterhand räknas kronologiskt. Ingen ändring av importerad öppningsbalans eller legacy-data.
- Utländsk native GAV räknas vid köp med avgift i samma valuta. SEK-GAV döljs efter ett utländskt köp när verklig SEK-anskaffningskostnad saknas. ECB:s värderingskurs är inte brokerens faktiska anskaffningskurs. Avgift i annan valuta utan anskaffningsbevis ger okänd kostnadsbasis. Detta måste färdigställas före pilotens utländska köp; bara antal/pris/datum räcker för native GAV, inte alltid SEK-GAV.
- Nordnet: SEK-native GAV behålls som SEK-GAV, medan utländsk GAV fortsätter vara separat.
- Första importen visar konto, antal, valutor, separat kassa och saknad anskaffningsmetadata före bekräftelse. Budskapet är nu start från öppningsbalans utan krav på gamla affärer.
- Granskad NAV-serieadapter: rätt fondklass/valuta, daterade positiva numeriska NAV, entydig ordning, käll-URL och arkivhash. Äldre publicerade NAV får endast bäras över datum där en verifierad fondkalender säger att publicering inte förväntas. Den servergranskade attesteringen måste skapas av en betrodd insamlare; en uppladdares `reviewed:true` är inte bevis. Källans arkivhash behöver beräknas/verifieras av insamlaren. Adaptern är testad med syntetiska arkiv och **inte aktiverad med verkliga fondarkiv**.
- Förberedd insamlingskärna för NAV framåt: hämtar en gång per bekräftad ISIN/valuta, behåller faktiskt NAV-datum separat från hämtningstid och avvisar fel identitet, valuta, framtida eller för gamla NAV. En misslyckad källa redovisas separat och får inte godkänna en portföljpublicering. Arkivets atomiska `commitBatch` ska versionsspara nya och rättade observationer; dess beständiga databasimplementation och schemaläggning återstår. Testad endast med syntetisk källa och injicerat testarkiv. Lysa behöver en egen verifierad källadapter innan anslutning till denna kärna.
- Historikadaptern blockerar ej stödda instrumenttyper, inklusive TO7, och icke numeriska/icke ändliga NAV. Faktisk broker-proveniens behålls i stället för att allt märks som Yahoo.

## Implementeringsordning för start framåt

1. Bekräfta konto, samma export-/öppningsdatum och all kassa per valuta. Godkänn explicita instrumentmappningar för Nordnet och eventuella Lysa-andelsklasser. GAV är valfritt för avkastningen. Fullständig värdering inklusive TO7 behövs för en graf märkt hela portföljen; en avgränsad delportfölj måste vara ett uttryckligt senare beslut och märkas tydligt.
2. Bygg serverns dagliga insamlare för senaste verifierade fond-NAV, Lysa-NAV och faktisk börsstängning för samtliga produkter. Spara originaldatum, källa, ISIN, notering/valuta och insamlingstid i delad marknadsdatacache. Upptäck ändrade leverantörsobservationer; bevara versioner och räkna om berörda portföljer. En befintlig cachepost får inte dölja en korrigerad kurs. Kalendrar/publiceringsfördröjning och nollkurser vid giltigt förfall kräver särskild verifierad hantering.
3. Daglig portföljvärdering börjar först när alla nödvändiga observationer finns för rätt datum. Vänta på sena NAV; visa senast kompletta datum. Ny marknadsinsamlare, NAV-publiceringskalendrar, faktisk GAV-FX och TO7-lösen/förfall är kvarvarande pilotblockerare. Gamla transaktionsadaptrar är inte längre en förutsättning för denna avgränsning.
4. Köp/sälj för kända innehav behåller antal, pris och datum som grundflöde. Fråga endast om okänt courtage eller otillräcklig kassa; faktiska externa flöden måste registreras separat. Bekräftad faktisk FX kan ligga under Avancerat. Framtida affärer, bolagshändelser och återimportavvikelser måste räknas om med revisionskontroll.
5. Dagsstängningar vid faktiska externa flöden ger normalt tydligt märkt Modified Dietz. Exakt TWR kräver verifierade före/eftervärderingar vid varje flödestidpunkt. Prisindex jämförs med portfölj inklusive utdelningar med en tydlig skillnadsförklaring. Historisk ECB USD/SEK är referens-FX för index, inte samtidig USA-stängnings-FX eller broker-FX.

## Staging, backup, migration och begränsad aktivering

Detta är en förberedelseplan, **inte ett produktionsgodkännande**. Inga molnprojekt har skapats, inga produktionsbackuper har tagits och ingen migration har körts utanför lokal Docker.

1. Skapa separat stagingprojekt med helt egna nycklar/Auth-användare och syntetiska motsvarigheter. Dokumentera exakt project-ref, API-host, databas-host och allowed origins. CI ska vägra okänd target och produktionsref. Local-test-skript fortsätter vägra alla molnprojekt. Flytta inte en produktionsdatabasdump till staging som syntetiska data.
2. Granska en separat additiv produktionsmigration, policy-/funktionsägare, search_path, EXECUTE-rättigheter och serviceidentitet. De nuvarande lokala RPC:erna ska inte göras produktionsklara genom att bara ta bort miljömarkören. Legacy-innehav, snapshots och andra befintliga tabeller ska varken skrivas om eller raderas. Produktionens schema-/RPC-version och kompatibilitet dokumenteras före godkännande.
3. Före eventuell produktion, efter separat godkännande: kontrollera tillgänglig backup/PITR och skapa krypterad export av schema, data och relevanta identitetsreferenser. Notera tidpunkt, projektref, objekträkning och kontrollsummor; logga inte hemligheter eller fulla portföljrader. Hantera Auth/Storage separat där en DB-backup inte täcker dem. Kontrollera åtkomst, retention och återställningsinstruktioner för det faktiskt valda Supabase-abonnemanget.
4. Bevisa återställning i en separat isolerad restore-miljö, med syntetisk backup först. Kontrollera FK, ägarskap, roller, RLS, journal/kassa/revisioner och historiska versioner. Ett test av RPC-rollback är inte ett backup-restore-test. Inget sådant fullständigt restore-prov eller produktionsbackup har ännu gjorts i denna etapp.
5. Stagingacceptans: minst två användare, idempotent import/jobbretry, negativ kassa/oversell, konkurrerande revisionsnummer, fel mitt i batch, backdaterad rättelse, sena NAV, kursrättelse, helgdagar, USD-köp/FX, utdelning och TO7-lösen/förfall. Jämför TWR/Dietz och GAV med handräkning samt verifiera att legacy-hash är oförändrad. Hemlig service key får aldrig ingå i frontend.
6. Presentera konkret migration, data-/källmatris, testbevis, backup-/restore-resultat, scheduler, leverantörsvillkor/budget och exakt pilotanvändare för separat godkännande. Global aktiveringsflagga förblir av; serverstyrd pilotlista är tom. UI-flagga ensam är inte åtkomstkontroll.
7. Efter det uttryckliga godkännandet: ta dokumenterad backup, kör granskad additiv migration, skapa första avstämda öppningsbalans endast för godkänd användare och kör skuggberäkning utan publicering. Kontrollera konto/innehav/kassa och första nollpunkt. Ingen import av gamla transaktioner och ingen ombasering av äldre graf.
8. Aktivera efter avtalad genomgång endast för godkänd användare/portfölj. Övervaka senaste kompletta datum, dataluckor, fel, cache-/källrevisioner och skrivkonflikter. Kill switch stänger import/journalskrivning/jobpublicering och pilotvy utan att radera journalen. Vid fel: stoppa jobb, bevara underlag, återgå till legacy-vyn och rätta framåt under ny revision. Destruktiv nedmigration eller återställning som skulle förlora senare affärer kräver nytt beslut.

## Leveranskontroller

Den lokala testmiljön verifieras uttryckligen före varje DB-körning: API `127.0.0.1:55321`, Docker `supabase_db_portfolio-performance-local-test`, databasport `55322`. Samtliga databasövningar använder syntetiska användare och data.

- **326 enhetstester passerar**, inklusive handräknat GAV med courtage, partiell/hel försäljning, rättelser, okänd anskaffningskostnad, utländsk GAV, granskade NAV-serier och insamlingskärnan framåt.
- `npm run lint`, `npm run build` och `npm run local-test:build` passerar. Båda byggena har befintlig varning för en större JavaScript-bundle; inga byggfel. Inget bygge har driftsatts.
- Core-journalens lokala DB-test passerar RLS med två separata Auth-användare, atomisk journal/kassa/revision, idempotens, samtidiga skrivningar, rollback och oförändrad legacy-data.
- Lokalt CSV-/historiktest passerar med tre separata Auth-användare, öppningsbalans inklusive kassa, separat fondkonto, rättelse/revisionshistorik, deduplicering och kapitalflöden. Testerna för äldre affärsimport behålls som regression trots att de inte är krav för den nya piloten.
- Lokalt HTTP-test passerar: icke registrerad portföljfil avvisas före skrivning, främmande origin blockeras, klienten kan inte välja annan användare och återimport ändrar inte journal/historik.
- Lokal grafkontroll passerar med verkliga OMXS30-/S&P 500-indexobservationer och historisk ECB USD/SEK för fyra **syntetiska** portföljer. Samma startdatum och 0 %-punkt, TWR utan externa flöden respektive tydlig Modified Dietz med externa flöden. Efter backdaterad rättelse verifieras GAV 79,5 SEK genom `(10 × 75 + 2 × 102) / 12`; delvis försäljning behåller GAV 40 SEK.
- `git diff --check` passerar, med endast Git-varningar om framtida LF/CRLF-normalisering.

Samtliga kontrollresultat gäller lokal implementation och de testfall som körts. De innebär inte att alla 29 verkliga instrument kan värderas komplett, att en beständig NAV-insamlare är aktiverad, att restore har verifierats eller att produktionsaktivering är godkänd.
