# Föreslaget staging-E2E-test – ännu inte godkänt i molnet

Mål enbart `vutjthqlgzokeylaxpzp`. Inga riktiga uppgifter, bakgrundsjobb eller
deployment. Denna plan är förberedelse, inte exekveringstillstånd.

## Lokalt genomförbart

`tests/stagingApp.test.mjs` använder en tillfällig loopbackserver med syntetiska
Auth-/databassvar, riktiga CSV-parser och stagingtransporter. Den verifierar
projektspärrar, miljöhandshake, routning, ägarhärledning, 7200 SEK öppningsvärde,
två användare, avvisad riktig fil/ägarspoofing och indexfel. Den ersätter inte
Supabase-inloggning, mobilkontroll eller ett moln-E2E-test.

`scripts/testStagingRuntime.mjs` installerar exakt godkänd foundation med
observerad automatic-RLS-trigger i en ny lokal scratchdatabas, därefter exakt
runtimeutkast. Auth-beroendet är en SQL-stubb. Två markerade syntetiska ägare
går genom import/återimport, certifikatköp, insättning, försäljning,
servervärdering, 0 %-start, TWR/Dietz, GAV, rättelse, gamla revisionsrader,
saknad NAV och återhämtning, kursarkivering/rättelse och atomiska fel.
Schemafel och ogiltig affär ska rulla tillbaka, och klientprivilegier granskas.
Legacyinnehav/snapshots samt befintliga lokala baselines fingeravtryckskontrolleras.
Kör DB-regressioner sekventiellt så andra syntetiska testers skrivningar inte
ändrar jämförelseunderlaget under repetitionen. Scratchdatabaser behålls lokalt.

## Moln- och webbläsarsteg efter separat godkännande

1. Kontrollera rätt projekt, runtimeversion, objekt/ACL/RLS och noll användar-
   och portföljrader. Kontrollera att markerade testidentiteter inte redan finns.
2. Skapa exakt två nya Auth-konton med unika `.invalid`-adresser och serverägd
   `portfolio_staging_synthetic`-markör. Spara run-ID, avsedda adresser och
   erhållna UUID i privat revisionskvitto. Slumplösenord/JWT stannar privat.
   Inga mejl skickas. Kontot får inte väljas genom en offentlig konto-lista.
3. Logga in som A via formuläret. Välj startpaket med Avanza/Nordnet-innehav,
   fond/Lysa-andelar, certifikat och kassa. Stäm av tre konton och fyra
   kassaposter; sex innehav och 7200 SEK ska vara öppningen 4 oktober.
   Saknade svar blockerar bekräftelse. Ingen gammal transaktionsfil krävs.
4. Importera samma paket igen: ingen ny journal/revision. Logga in som B:
   A:s öppning, journal och observationer får inte synas. Importera samma
   syntetiska paket i B och jämför ägarscope för alla tabeller och RPC.
5. Som A: köp två certifikat 5 oktober till 10,5 SEK (avgift 0), sätt in
   100 SEK 6 oktober med explicit Dietz-schablon och sälj ett 7 oktober till
   11 SEK (avgift 1). Kontrollera atomisk kassa/journal/revision, retry/dubblett
   och att B är oförändrad. Ogiltig försäljning får inte lämna en deltransaktion.
6. Som A: testa USD-affär ur valutakassa och separat automatisk mäklarväxling
   med faktiskt SEK-totalbelopp. Inget ECB-belopp används som avräkning.
7. Logga ut. Kör servicevärdering utan användarsession för det daterade scenariot.
   Logga in igen: observerade värderingar, samma öppningspunkt och 0 %.
   TWR utan externa flöden; tydligt uppskattad Dietz när flödesvärdering saknas.
8. Välj OMXS30/S&P 500 och period, navigera/uppdatera: preferensen ska kvarstå
   per staginganvändare. Verkligt index kräver verifierad källa, gemensamt
   faktiskt datum och historisk USD/SEK; märk prisindex/utdelningsskillnaden.
   Testa tjänstefel och saknat index/FX: överlägg uteblir med begripligt besked.
9. Rätta en tidigare affär och publicera om: ny revision, gamla observationer
   bevaras, GAV/kassa rätt, gamla värderingar döljs. Prova avsaknad av en
   daterad NAV: bara komplett prefix får visas. Återhämtning ska ge resten
   utan dubbletter. En affär efter demoslut ska inte ge påhittad kurs/avkastning.
10. Kontrollera inloggning/import/köp/sälj/graf vid 390 × 844 och desktop,
    tangentbord, användarbyte under begäran, utloggning och session som löper ut.
    Screenshots får inte innehålla lösenord, nycklar eller JWT.

## Avgränsning och städning som behöver godkännas

Tillåt endast två konton med verifierbara UUID/email/app_metadata/run-ID,
två baselines, deras importkvitton/journal/rättelser/körstatus och de
värderingsrevisioner teststegen skapar. Delat arkiv begränsas till sex syntetiska
instrument och daterade testkurser/FX. Inga andra konton eller instrument.
Detaljerat förväntat antal rader och körningskvitto ska fastställas i ett
molntestskript före godkännandet; denna plan godkänner inte obegränsade skrivningar.

Städning kräver markör-/UUID-kontroll först. Ta bort dessa ägares runtime-
importkvitton, körstatus och rättelser före Auth-radering (FK utan CASCADE).
Auth-radering kaskadraderar foundationraderna. Delad syntetisk cache och dess
versioner får städas bara enligt separat exakt nyckelinventering, aldrig med
generell tabelltömning. Miljöidentitet och schema ska finnas kvar.
Vid avvikelse stoppa; behåll bevis och städa endast säkert verifierade identiteter.
Efterkontroll ska visa inga provkonton/rader kvar och identisk schemametadata.

Testet bevisar tekniskt flöde. Verklig fondkalender, sena NAV över flera riktiga
handelsdagar, licensierad kurstäckning och molnbackup/restore återstår separat.
