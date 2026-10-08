# Market API: lokal verifiering och förberedd deployment

Deployment genomfördes 2026-10-08 efter användarens uttryckliga godkännande.
`market-api` är aktiv som Supabase-version 6 och returnerar `market-quotes-v2`.
JWT-kontrollen är fortsatt aktiverad. `daily-portfolio-snapshot` är oförändrad på version 19.

## Resultat från driftsatt miljö

Skrivskyddat röktest kördes med frontendens `createMarketApiFetch` och `getVerifiedHoldingQuote`,
ordinarie publishable key och ett giltigt anonymt JWT. Ingen användarsession eller databasskrivning användes.
Alla sex instrument godkändes med pris och verklig källtid från samma svar:

| Instrument | Källa | Pris | Källtid UTC / NAV-datum |
| --- | --- | --- | --- |
| AbCellera | Yahoo | 12.83 USD | 2026-10-07 20:00:01 |
| Avanza Zero | Avanza NAV | 559.22 SEK | 2026-10-07 |
| Investor B | Avanza | 405.25 SEK | 2026-10-08 11:36:40 |
| Palantir | Yahoo | 194.12 USD | 2026-10-07 20:00:00 |
| Alibaba | Yahoo | 107 USD | 2026-10-07 20:02:22 |
| Berkshire Hathaway B | Yahoo, BRK-B | 506.25 USD | 2026-10-07 20:04:35 |

Avanzas USA-kurser underkändes på irrelevant källtid och Nordnets på nollpris;
fallback fortsatte till giltiga Yahoo-kurser. Ogiltig Yahoo-symbol gav HTTP 404 med säker diagnostik.
Frontendens versionskontroll och CORS-preflight passerade mot drift.

SELECT-kontroller bekräftade att samtliga sex innehav har samma sparade priser, null-kurstider
och `updated_at` som användarens tidigare underlag. Befintlig historik 2026-10-04 finns kvar med
samma sparade belopp och observationstid som före publiceringen.
Inga schemaändringar, prisuppdateringar eller historikpunkter skapades av deployment/verifiering.
Datakontrollen omfattade dessa sex innehav och deras portföljhistorik; ingen jämförelse av hela databasen före/efter gjordes.

Återstår: faktisk inloggad webbläsarkontroll, prislagring efter vanlig uppdatering och ett nytt
dagsvärde när hela portföljen är verifierad. Webbläsarverktyget kunde inte starta (Windows-fel 1056).
Röktestet verifierar inte användarsession, RLS eller den faktiska frontendens cache.
Ingen återställning behövdes eftersom deployment och driftstester passerade.

Lokalt efter deployment: 185/185 tester, lint och produktionsbygge passerade.
Bygget har fortsatt en varning om JavaScript-paket över 500 kB.

Återställningskopian av version 5 ligger i `deployment-backups.local/before-market-quotes-v2`.
Den innehåller en fristående `index.ts` utan importer och motsvarande `verify_jwt = true`-konfiguration.
Återpublicera vid behov från projektroten:

```powershell
npx --yes supabase functions deploy market-api --project-ref ertvxedbqcqydeypnorm --use-api --workdir '.\deployment-backups.local\before-market-quotes-v2'
```

Observera att återställning till gamla API-versionen också kräver en kompatibel frontend enligt nedan.
Reproducerbar skrivskyddad kontroll: `node scripts/check-market-quotes.mjs --deployed`.

## Vad som publiceras

Endast Edge Function `market-api` i projekt `ertvxedbqcqydeypnorm` och dess importerade `_shared`-moduler.
Ingen SQL, migration, databasåterställning, secretändring eller separat snapshot-deployment ingår.
`supabase/config.toml` behåller `verify_jwt = true` för `market-api`.

Den faktiska frontendkonfigurationen pekar på:

```text
https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api
```

Den uppdaterade frontendklienten kräver `apiVersion: "market-quotes-v2"` för värdepapperskurser och NAV.
En gammal driftsatt backend ger `MARKET_API_VERSION_MISMATCH` i kursdiagnostiken och kan inte tyst leverera overifierade kurser.
Den nya frontendversionen och Edge-versionen ska därför aktiveras tillsammans.

## Lokal kontroll

```powershell
npm test
npm run lint
npm run build
node scripts/check-market-quotes.mjs
```

Livekontrollen är skrivskyddad och kontaktar endast offentliga kursleverantörer. Den sparar inte innehav eller historik.
Regressionstesterna kör den faktiska Edge-handlern och frontendens kursfunktioner med isolerade leverantörssvar.
De ersätter inte ett slutligt röktest från Supabases körmiljö.

För manuell frontendtest mot den lokala, korrigerade Express-servern:

```powershell
# Terminal 1
node server/index.js

# Terminal 2: gäller endast denna process/terminal, ändrar ingen .env-fil
$env:VITE_MARKET_API_URL = 'http://localhost:3001'
npm run dev
```

Inloggad frontend kan skriva verifierade priser och dagens historik enligt befintligt flöde.
För en helt skrivskyddad leverantörskontroll används Node-skriptet ovan.

## Efter godkännande: CLI och återställningsunderlag

Supabase CLI, Deno och Docker hittades inte på PATH under lokal verifiering.
CLI kan köras via `npx`; `--use-api` låter Supabase paketera funktionen utan lokal Docker.
Autentisera med Supabase CLI:s vanliga inloggning. Lägg inte access tokens i kommandoargument, dokument eller loggar.

Hämta först nuvarande driftsatta funktion till en separat katalog i arbetsytan, inte över de ändrade källfilerna:

```powershell
New-Item -ItemType Directory -Force -Path '.\deployment-backups.local\before-market-quotes-v2'
npx supabase functions download market-api --project-ref ertvxedbqcqydeypnorm --use-api --workdir '.\deployment-backups.local\before-market-quotes-v2'
```

Kontrollera att återställningsunderlaget innehåller funktionens driftsatta kod och samtliga importerade filer.
Bevara även befintlig funktionskonfiguration. Inga befintliga filer behöver raderas.

## Efter godkännande: publicering

Kör från projektroten:

```powershell
npx supabase functions deploy market-api --project-ref ertvxedbqcqydeypnorm --use-api
```

Kör inte `db push`, `db reset`, deployment av alla funktioner eller `--no-verify-jwt`.

## Kontroll efter publicering

Öppna frontend med ordinarie Supabase-URL och en giltig inloggning. Kontrollera i Network och konsolens `quote-verification`:

- ABCL, PLTR och BABA: verifierad symbol/valuta och senaste relevanta USA-session.
- BRK.B: förfrågan och verifierat svar använder BRK-B.
- INVE B/Stockholmsbörsen: normaliseras till INVE-B.ST; korrekt SEK-kurs och relevant Stockholm-session.
- Avanza Zero: `/api/fund-nav`, Avanzas fondguide, `kind = published_nav` och verkligt NAV-publiceringsdatum.
- Kurssvaren innehåller `apiVersion = market-quotes-v2` och säker diagnostik.
- Ett leverantörsfel visar orsaken och eventuell HTTP-status utan att ta bort det tidigare sparade priset.
- Dagens historik skrivs först när alla relevanta innehav är verifierade. Dagar som saknar observation fylls inte i.

Om Yahoo blockeras från Supabases nätverk ska den strukturerade statusen kontrolleras. Godkänn inte en kurs utan källtid som lösning.

Vid behov av återställning: återpublicera den sparade tidigare funktionsversionen från den separata katalogen och återställ frontend till motsvarande version. Ingen historik behöver ändras.

Referenser: [Supabase function deploy](https://supabase.com/docs/reference/cli/supabase-functions-deploy),
[Supabase function download](https://supabase.com/docs/reference/cli/supabase-functions-download).
