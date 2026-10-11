# Granskning av portföljjämförelse, 9 oktober 2026

Uppföljning 10 oktober: [implementation och konkret schemaförslag](portfolio-performance-v1.md). Det nya uppdraget börjar vid första verifierade importen; äldre investeringshistorik behöver inte rekonstrueras. Beskrivningen nedan är ursprunglig granskning, inte en aktuell status för alla senare kodändringar.

## Omfattning och verifieringsgräns

Granskningen gäller aktuell källkod, SQL-definitioner och befintliga tester. Ingen produktionsdatabas har lästs eller ändrats. Historik från 4 oktober är användarens uppgift och förekommer i testdata; faktisk första observation, luckor och transaktionstäckning per konto måste kontrolleras läsande innan jämförelse aktiveras. Tidigare driftsättningskontroller i index-history.md är dokumenterade tidigare resultat, inte nya kontroller i denna granskning.

## Befintliga förutsättningar

- PortfolioSummary använder lokalt useState med All som standard. Navigering avmonterar komponenten och återställer valen. Period och index sparas nu separat per användare i webbläsarens localStorage och läses vid montering. Kontobyte monterar en ny sammanfattning. Valet behålls även om indexdata saknas. Det synkroniseras inte mellan enheter; om webbläsaren blockerar lagring fungerar valet bara under aktuell montering.
- Dashboard renderade HoldingsOverview både direkt efter huvudgrafen och längre ned. Den senare renderingen är borttagen.
- portfolio_daily_values innehåller datum, totalvärde i SEK och observationstid, med ett värde per användare/dag. Nyare observation ersätter äldre samma dag. Det är inte en historik över positioner, kassa eller värden före/efter varje kassaflöde, och inte garanterade marknadsstängningar.
- holdings beskriver aktuella positioner. Vanliga BUY/SELL-transaktioner har antal, pris, valuta, FX, avgift och datum men lagras i localStorage. De bevisar inte komplett kontoaktivitet och köp/sälj är inte i sig externa kassaflöden.
- Lysa har användarägd JSON-lagring för transaktioner och performance i Supabase. Beräkningarna känner igen Deposit/Withdrawal och fondköp/försäljningar. Fullständighet, tidsupplösning och avstämning mot kontoutdrag måste verifieras. Manuella tillgångars aktuella värden ger ingen historisk värderingsserie.
- Indexadaptern hämtar dagliga close för ^OMX i SEK och ^GSPC i USD via Yahoo, kontrollerar identitet och utelämnar saknade/ofärdiga dagsstaplar. Barens tidsstämpel är inte verifierad stängningstid. ALL begär högst tio år.
- Dashboard skickar inga benchmarks eller portfolioReturns till PortfolioSummary. Indexvalet kan därför inte ge en fungerande jämförelse. Dokumentationen om fristående index i dashboarden beskriver inte den nuvarande kopplingen.
- Grafen har en skyddad procentjämförelse, men ingen TWR-beräknare eller ansluten adapter. Nuvarande kontrakt kräver identiska observationstider och identisk utdelningsbas. Ett livevärde blockerar jämförelsen. Dessutom filtreras beräknad baspunkt bort om den ligger före visningsperioden: framtida jämförelse måste behålla sin 0 %-punkt.
- FX-referensadaptern stöder daterade referenser men accepterar bara förfrågningar inom senaste 14 dagarna. Den räcker inte för längre indexhistorik. Aktuell visningskurs får inte användas för historisk avkastning.

## Föreslagen implementeringsordning före större ändringar

1. Klart: en innehavsöversikt och bestående period/indexval, utan databasändringar.
2. Läsande inventering: första/sista snapshot, luckor, observationstider, konton, kassa, tillgångstyper samt transaktionernas ursprung och täckning. Stäm av Lysa och övriga konton mot exporter. Ange saknade delar per konto och period. Saknade transaktioner får aldrig automatiskt tolkas som noll kassaflöde.
3. Fastställ portföljens gräns och avkastningskonvention: inkluderad kassa, externa insättningar/uttag och värdepappersöverföringar, interna affärer/överföringar, utdelningar, avgifter och tidszon. OMXS30 och vanlig S&P 500 är prisindex. TWR inklusive utdelningar kan visas mot dem endast med tydlig skillnad i utdelningsbas; alternativt väljs verifierade totalavkastningsvarianter. Det nuvarande likhetskravet behöver då ett medvetet nytt kontrakt.
4. Inför verifierat kassaflödesunderlag och värderingar vid flödestillfällen. Exakt TWR länkar avkastningen mellan externa flöden geometriskt: produkten av delperiodernas tillväxtfaktorer minus ett. Enbart dagliga totalvärden och dagsnetto räcker inte för exakt TWR när flödets tidpunkt/värdering saknas. Visa underlagsbrist i stället för att kalla en approximation TWR. Föreslå konkret lagring, källspårning och import först; varje schemaändring eller skrivning av portföljdata kräver användarens godkännande.
5. Anslut historiska index och historisk USD/SEK. S&P i SEK använder indexnivå gånger SEK per USD vid varje observation, därefter normalisering. Dokumentera FX-källa, faktiskt kursdatum och referenstid; en daglig centralbanksreferens är inte en samtidig USA-stängningskurs. Välj och redovisa en konsekvent daglig värderingskonvention för olika marknadsstängningar/NAV. Fabricera aldrig identiska tidsstämplar för att passera nuvarande skydd.
6. Välj gemensamt faktiskt start- och slutdatum inom period och verifierad täckning. Behåll startpunkten, normalisera båda till 0 % där och visa datum samt eventuell kortare täckning. Håll jämförelsens historiska slutdatum separat från dagens livevärde. Rita bara jämförbara observationer; redovisa luckor och deras effekt utan interpolation eller dolda datumförskjutningar. Testa insättningar, uttag, interna affärer, FX-riktning, olika helgdagar, saknade priser och gemensam baspunkt innan aktivering.
7. Längre historik än 4 oktober: rekonstruera positioner från verifierad öppningsbalans och fullständig aktivitet (även avyttrade innehav, utdelningar, splitar och överföringar), avstämda mot kontoutdrag. Hämta historiska priser/NAV, kassa och FX för faktiskt ägda positioner. Dagens innehav eller snittanskaffningspris får inte projiceras bakåt. Lysa performance kan användas först efter verifiering av vad serien mäter och dess kassaflödesbehandling. Saknas underlag för en tillgång blockeras totalportföljens jämförelse; eventuell delportfölj måste benämnas uttryckligen. Rekonstruktion bör initialt vara separat beräkningsdata utan att skriva över snapshots.

## Metodreferenser

- [GIPS Handbook](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/): TWR, externa flöden och geometrisk länkning.
- [Nasdaq OMXS30 faktablad](https://indexes.nasdaqomx.com/docs/FS_OMXS30.pdf): OMXS30 är prisindex.
- [Frankfurter](https://frankfurter.dev/): historiska referenskurser. Datumsupport innebär inte samtidig marknadsstängningskurs.

Inga nya indexkurser har verifierats mot livekälla här. Inga förändringar i databas, historiska snapshots, befintliga transaktioner eller produktionsdriftsättning ingår.
