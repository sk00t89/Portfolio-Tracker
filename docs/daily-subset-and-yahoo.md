# Verifierad delmängd och Yahoo-fallback

## Diagnos 8 oktober 2026

Dagsmodellen beräknade redan jämförelsevärden för täckta positioner men exponerade kronor/procent enbart när hela portföljen var komplett. NAV från 7 oktober och positioner utan previousClose/FX-datum blockerade därför också visning av en annars verifierad delmängd. Instrumenttäckning 100 % bevisar inte komplett dagsunderlag; giltigt senaste NAV eller värderingskurs kan sakna dagens jämförelse.

GET-spårning av frontendens verkliga fallbacklogik mot publicerad market-api reproducerade exakt användarens åtta 404. Routen fungerar; svaret innehåller `market-quotes-v2` och Yahoo-providerdiagnostik med HTTP 404. Ingen ny Yahoo-symbol har verifierats för dessa åtta instrument. Base URL är `https://ertvxedbqcqydeypnorm.supabase.co/functions/v1/market-api/api/yahoo-price/`:

| Suffix | Instrument |
| --- | --- |
| VIRAVAX.ST | Virtune Avalanche ETP |
| VIRLINK.ST | Virtune Chainlink ETP |
| VIRALT.ST | Virtune Crypto Altcoin Index ETP |
| VIRADA.ST | Virtune Staked Cardano ETP |
| VIRSETHS.ST | Virtune Staked Ethereum ETP |
| VIRDOT.ST | Virtune Staked Polkadot ETP |
| VIRSOL.ST | Virtune Staked Solana ETP |
| VIRXRP.ST | Virtune XRP ETP |

Det var verifiering av dagsunderlag som drev fallback efter brokerkurser utan komplett previousClose. Alla åtta 404 inträffade en gång i den lästa batchen; VIRALT:s två positioner delade redan ett anrop. Ytterligare sekventiella Yahoo-anrop upprepades för EVO.ST, VALOUR-BTC-0-SEK.ST och VALOUR-S-SEK.ST eftersom batchnyckeln innehöll handelsplatsens råtext. Ny batchnyckel använder samma kalender och normaliserade symbol som verifieraren, men behåller användare, provider, provider-ID, ISIN, instrumenttyp och valuta.

## Avgränsad korrigering

`dailySubsets` grupperar enbart kompletta positioner med exakt samma aktuella/föregående jämförelsedagar. Den visar den aktuella dagens grupp först, annars den senaste dagen. Olika dagar summeras aldrig. Kronor och procent avser gruppen, procent har gruppens verkliga tidigare jämförelsevärde som bas. Täckningsandelen är gruppens andel av portföljens visade SEK-värde; båda beloppen visas och är separat från referensvalutaberäknad förändring. Okänd totalvärdesbas ger okänd täckningsandel, inte 100 %.

Relevanta affärer/flöden eller odaterade transaktioner stoppar även delmängden. Komplett total fortsätter kräva all tidigare validering. Försenade NAV ligger i en separat daterad NAV-lista och ingår aldrig som dagens kurser. 1D skapar fortfarande ingen intradagskurva; delmängden används inte som ett historiskt portföljvärde eller indexavkastning.

De åtta specifika ISIN/symbol-paren är markerade `YAHOO_LISTING_UNVERIFIED` för noterade certifikat/ETP/tracker. Enbart dessa obekräftade listningar hoppas över. Återaktivera först när rätt instrumentidentitet/listning kan verifieras hos Yahoo. Brokerförsök, andra Yahoo-symboler och deras verkliga HTTP-fel är oförändrade och fortsätter diagnostiseras. Ingen status omskrivs till lyckad kurs, ingen föregående kurs eller tidsstämpel lånas från annat instrument. Befintlig verifierad värderingskurs kan återkomma med `VALUATION_ONLY` när dagsunderlag saknas.

## Säkerhet och verifiering

Ändringen behöver bara frontenddeployment. market-api version 7 och daily-portfolio-snapshot version 19 är oförändrade. Det finns inga SQL-/schemaändringar eller nya skrivvägar till innehav, antal, GAV, kapital eller historik. Verifiering använder enbart GET/SELECT och transient jämförelse.

Regressioner täcker delmängd med fördröjt NAV, viktad värdetäckning, korrekta FX-datum, saknade priser och baser, verklig nollförändring, affärer/flöden, okända totalvärden, olika handelssessioner, ofabricerad 1D, alla åtta Yahoo-exkluderingar, bibehållen fallback för andra instrument och deduplicering med användar-/valutaisolering.

Efter publicering: kontrollera produktionsbundlen med `scripts/check-frontend-release.mjs` och kör den nya frontendverifieraren mot oförändrad publicerad Edge Function med läsande provideranrop. Faktisk inloggad användarsession kontrolleras separat; röktesten skriver inga priser eller snapshots. Exakta procent/belopp kan ändras med marknadernas kurser och nya NAV-publiceringar.

Läsande före/efter-spårning mot produktionsbackend: 37/37 positioner behöll verifierad senaste värderingskurs. Antalet provideranrop minskade från 90 till 73; Yahoo-anrop från 26 till 15, de åtta HTTP 404 från åtta till noll och upprepade Yahoo-URL:er från tre till noll. Detta verifierar nya klientlogiken mot driftsatt backend, inte användarens faktiska inloggade React-state. 239 regressionstester, lint och build passerade; befintlig paketstorleksvarning över 500 kB kvarstår.
