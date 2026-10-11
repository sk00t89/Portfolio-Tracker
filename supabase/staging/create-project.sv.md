# Skapa tom staging — enkel instruktion

Rekommendation för första syntetiska testet: **Free** och den specifika regionen
**North EU (Stockholm), eu-north-1**. Välj **Central EU (Frankfurt), eu-central-1**
om Stockholm inte är tillgängligt. Välj en specifik region, eftersom den allmänna
Europe-gruppen även kan placera projekt utanför EU.
[Supabase-regioner](https://supabase.com/docs/guides/platform/regions).

Free kostar USD 0, har högst två aktiva projekt, kan pausas efter en veckas
inaktivitet och saknar automatiska databasbackuper. Det räcker för detta första
test med påhittade data och manuell backup/restore. Om organisationen redan har
Pro kan ett ytterligare projekt medföra kostnad: kontrollera priset före skapande.
Pro börjar på USD 25/månad och inkluderar dagliga backuper i sju dagar; extra
projekt börjar på USD 10/månad. Uppgradering behövs inte nu och ska beslutas
separat inför längre driftprov/pilot. [Aktuell prislista](https://supabase.com/pricing).

1. Logga in på [Supabase Dashboard](https://supabase.com/dashboard).
2. Välj en organisation med **Free** för kostnadsfritt test, om ledig projektplats
   finns. Ändra inte produktionsorganisationens abonnemang. Om Free inte går att
   välja, stanna innan en betalning eller kostnad godkänns.
3. Klicka **New project** och ange namnet `portfolio-tracker-staging`.
4. Skapa ett nytt starkt databaslösenord och spara det i din lösenordshanterare.
   Använd inte produktionslösenordet. Välj Stockholm enligt ovan och kontrollera
   att sammanställningen visar förväntad kostnad innan du skapar projektet.
5. Vänta tills projektet är klart. Lämna det **tomt**: importera inga data, klona
   inte produktion, kör ingen SQL och anslut inte GitHub/Vercel eller schemaläggare.
6. Skicka bara **Project ID / project ref**, vald region och plan till mig.
   Project ref finns i projektets inställningar och dashboard-adress. Skicka inga
   API-nycklar, databaslösenord eller anslutningssträngar i chatten.

Det räcker från dig i detta steg. Jag tar sedan fram den exakta stagingmigrationen
och konfigurationen för granskning utifrån den nya projektidentiteten. Att skapa
ett projekt aktiverar inte appen; molnanslutning och körning ska vara uttryckligen
godkända för just detta stagingprojekt. Produktionsaktivering kräver separat beslut.

Efter godkänd staginginstallation ska två syntetiska testanvändare köra import,
kassa, öppningsbalans, affärer, avkastning och syntetisk historik/index. Återställning
testas i en separat godkänd miljö med schemaläggare avstängd. Databasbackuper omfattar
inte själva Storage-filerna, och molninställningar/hemligheter kräver separat
återställningsrutin. [Supabase om backup](https://supabase.com/docs/guides/platform/backups).

Lokalt verifierat i denna etapp: tomdatabasinstallation, avsiktligt migreringsfel
med full rollback, två ägaridentiteter med RLS samt audit av sju tabeller och
sjutton funktioner. Detta är inte bevis för en redan fungerande molnstaging.
