# Public source coverage and licensing — 11 October 2026

Code and synthetic portfolios may be pushed; the complete real-portfolio pilot is
still blocked by source coverage and permission to use/redistribute market data.
No paid source has been purchased, and no new external account has been created.
Focused follow-up: public documentation only, five funds and sixteen certificates.
No API account, supplier contact, subscription, dataset import or code change was
made. A public catalogue entry proves identification, not usable daily coverage.

| Source | Verified locally | Missing before pilot | Cost/terms |
| --- | --- | --- | --- |
| Avanza/Nordnet public endpoints | Dated latest fund NAV matched to ISIN/class/SEK; own listed certificate prices matched to identity/session | Reliable dated recovery API for all five funds and 16 certificates; documented retention/correction rules and service contract | No charges incurred; production access, redistribution rights and price/SLA unconfirmed. A public webpage is not an API licence. |
| Yahoo | Actual daily stock closes and OMXS30/S&P 500 history; rolling stock recovery window | Licensed delivery/display/derived-data permission and corporate-action verification | [Yahoo's provider notice](https://au.help.yahoo.com/kb/finance-for-web/exchanges-cover-sln2310.html) prohibits redistribution. A personal subscription is not assumed to license this app. Do not publish fetched datasets in Git. |
| Frankfurter / ECB | Dated historical USD/SEK, actual source dates, reviewed TARGET closures, corrections/versioning | Operational availability monitoring and selected-provider legal review | [Frankfurter terms](https://frankfurter.dev/license/) distinguish open-source code from provider data terms. [ECB reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html) permits reuse subject to attribution/disclaimers. No subscription paid; reference rates never substitute broker settlement. |
| Pensionsmyndigheten | Official archive candidate and LF USA Index ISIN identified | XLSX identity/date/price validation, class coverage, distribution adjustments and reuse rights before ingesting | [Official statistics](https://www.pensionsmyndigheten.se/statistik-och-rapporter/statistik/statistik-for-premiepension) publishes historical fund unit-price files and warns current verified prices lag 1–2 days and are not distribution-adjusted. Not yet an active adapter; not assumed to cover all holdings. |
| Lysa | Public latest records exist | Actual classes/dated historical NAV and publication evidence | No authenticated account or user's holdings accessed; licence/cost and full historical coverage unconfirmed. |
| NAV-center, Fondbolagens förening | Fund-company-reported NAV, distributor agreement, twice-daily files or on-demand API are documented in the [distributor factsheet](https://www.fondbolagen.se/globalassets/om-oss/nav-center/infoblad_nav-centrum_d_eng.pdf) | Exact five-ISIN coverage, dated historical retrieval/retention, corrections and publication calendars are unconfirmed | Distributor rights are contractual, non-exclusive and non-transferable; no public tariff found in the reviewed material. Quote required. Strong fund-only candidate, not a confirmed free feed. |
| FE fundinfo | [Official feed factsheet](https://www.fefundinfo.com/media/d5mp5xg2/fef-feeds-for-hedge-funds.pdf) documents daily NAV, price/performance history and API/SFTP delivery | No authenticated sample or confirmation of the five classes, recovery window, corrections or calendars | Commercial feed candidate; exact app/display/derived-data/retention rights and price require a quote. No public applicable price verified. |
| Morningstar Licensed Data | [Licensed data product](https://www.morningstar.com/en-gb/business/products/data) and [scheduled feeds](https://www.morningstar.com/business/products/direct/data-feeds) exist with appropriate licensing | Per-ISIN historical samples, missed-date recovery, calendars and revisions not verified | Quote required for this app. A Direct seat or public fund page is not proof of redistribution rights. |
| SIX Web API | [Official API factsheet](https://www.six-group.com/dam/download/financial-information/display-delivery-capabilities/six-web-api/six-web-api-factsheet-en.pdf) documents ISIN/MIC identification and historical multi-asset prices | Match each SEK listing and fund class; confirm issuer NAV vs exchange close, history range, corrections and holidays | Best single-provider candidate to investigate, not verified 21/21 coverage. Price and commercial display/derived-data/archiving rights require a quote; no applicable public tariff verified. |
| EODHD | Three exact EUFUND catalogue matches below; [EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes) supports date-range historical requests | Actual daily NAV samples, freshness and provenance for each class; two funds and all sixteen certificate listing histories unconfirmed. Exchange holiday API is not a fund publication calendar. | [Published commercial prices](https://eodhd.com/commercial-pricing): internal use USD 399/month (USD 3,990/year); Enterprise USD 2,499/month (USD 24,990/year); Custom from USD 399/month. Internal tier excludes corporate-server download; Enterprise includes it. Neither headline alone confirms paid-user redistribution rights. [Personal/commercial distinction](https://eodhd.com/financial-apis/commercial-vs-personal-license-use) rules out assuming the USD 19.99 personal price licenses this app. |
| Nasdaq / Spotlight direct | [HistoricalView](https://www.nasdaq.com/products/data/nordic-baltic/historicalview) has dated trade/order files, 30 days online and older files by request. [Spotlight](https://www.spotlightstockmarket.com/sv/trading-members/marknadsdata/) distributes market data through Nasdaq | Exact product/listing coverage, historical venue changes, official close semantics and app licensing; historical ticks are more than the daily-close data we need | Published September-2026 [redline price list](https://www.nasdaq.com/docs/data/Nasdaq_European_Other_Markets_Data_Products_Price_List_September_2026_Redline), p.6: HistoricalView subscription EUR 1,144/month per asset class, internal use; database orders EUR 436 per asset class per historical calendar month. These are dated reference fees, not a current all-in app/Spotlight quote. Latest schedule, delivery and external rights need confirmation. |

## Per-ISIN evidence for the blockers

All prices must be dated actual unit NAV or the **listed SEK product's close**.
Crypto spot, issuer indicative value/PCF, performance percentages and a different
currency listing are not interchangeable with that product close. No commercial
provider's complete usable history has been verified for any of these 21 ISINs.
This means unverified, not necessarily unavailable.

| Fund / SEK class | ISIN | Evidence and remaining recovery check |
| --- | --- | --- |
| Avanza Zero | SE0001718388 | [EODHD exact catalogue entry](https://eodhd.com/financial-summary/SE0001718388.EUFUND). Historical API capability documented, actual NAV series not tested. NAV-center/FE/Morningstar/SIX class coverage unconfirmed. |
| Kavaljer Quality Focus A SEK | LU1232457504 | [EODHD exact catalogue entry](https://eodhd.com/financial-summary/LU1232457504.EUFUND). A SEK class match is visible; fresh issuer NAV, historical completeness and correction handling remain unverified. Other feeds unconfirmed. |
| Länsförsäkringar USA Index | SE0002793943 | No exact EODHD entry verified in this focused search. Pensionsmyndigheten remains the existing archive candidate, not a certified adapter; class/date/reuse checks pending. NAV-center/FE/Morningstar/SIX need exact match. |
| Spiltan Aktiefond Investmentbolag | SE0004297927 | [EODHD exact catalogue entry](https://eodhd.com/financial-summary/SE0004297927.EUFUND). Full dated NAV retrieval untested. Reviewed issuer calendar does not establish a provider's missed-date recovery. Other feeds unconfirmed. |
| Swedbank Robur Access Asien A | SE0007074117 | No exact EODHD entry verified in this focused search. NAV-center/FE/Morningstar/SIX need class-specific history and Asian-market publication/closure handling. |

Catalogue pages have dated display values and generic stock/earnings fields; these
are not evidence of an up-to-date, complete issuer-NAV feed. EODHD's demo key is
limited to other specified symbols, so the five fund series were not tested.
The absence of a search result is not proof a provider lacks that fund.

Listed-market routes below follow the existing public instrument catalogue;
they are **quote-request targets**, not confirmed supplier entitlements.

| Certificate | ISIN | Listed-history route to verify |
| --- | --- | --- |
| Valour Arweave | CH1108679304 | Spotlight SEK listing via licensed vendor/SIX or Nasdaq/Spotlight |
| Valour Sui | CH1213604601 | Same route; exact ISIN, SEK listing and date range required |
| Valour Avalanche | CH1114178788 | Same route; exact ISIN, SEK listing and date range required |
| Valour Bitcoin Zero | CH0585378661 | Same route; Spotlight's public INET list explicitly identifies this ISIN |
| Valour Ethereum Zero | CH1104954362 | Same route; Spotlight's public INET list explicitly identifies this ISIN |
| Valour Gram (catalogue name) | CH1161139600 | Same route; Spotlight calls this ISIN Toncoin. Confirm name/lifecycle continuity before mapping history |
| Valour Polkadot | CH1114178770 | Same route; exact ISIN, SEK listing and date range required |
| Valour Sonic | CH1108679353 | Same route; exact ISIN, SEK listing and date range required |
| Virtune Avalanche | SE0022050092 | Nasdaq Stockholm SEK listing via licensed vendor/SIX or Nasdaq |
| Virtune Chainlink | SE0021149259 | Same route; exact ISIN, SEK listing and date range required |
| Virtune Crypto Altcoin Index | SE0023260716 | Same route; rebalance/constituents are not a substitute for product closes |
| Virtune Staked Cardano | SE0021630449 | Same route; exact ISIN, SEK listing and date range required |
| Virtune Staked Ethereum | SE0020541639 | Same route; exact ISIN, SEK listing and date range required |
| Virtune Staked Polkadot | SE0021148129 | Same route; exact ISIN, SEK listing and date range required |
| Virtune Staked Solana | SE0021309754 | Same route; exact ISIN, SEK listing and date range required |
| Virtune XRP | SE0021486156 | Same route; exact ISIN, SEK listing and date range required |

Identity references: [Spotlight INET list](https://indicator.spotlightstockmarket.com/en/trading-members/inet-list/)
and [Virtune's issuer notice listing all eight ISINs](https://www.virtune.com/sv/news/change-of-calculationagent).
The latter describes ETFBook's PCF calculation role, not a licensed exchange-close
API. Do not infer listed-price recovery from issuer calculation-agent data.
Spotlight's [policy effective 1 October 2026](https://www.spotlightstockmarket.com/media/l4sjtgua/261001-spotlights-market-data-policy.pdf)
requires applicable Nasdaq/Spotlight terms; historical subscriber rights include
internal-use restrictions. Delayed data availability does not settle our app's
external display, derived-return or historical archiving rights. No complete
sixteen-ISIN dated history, backfill range or commercial tariff was verified.

## Focused recommendation and comparable quote requirements

1. Compare a **single SIX quote** for all 21 instruments with **NAV-center plus a
   licensed Nasdaq/Spotlight vendor** for the sixteen SEK certificates. FE fundinfo
   or Morningstar is the fund-feed fallback if NAV-center lacks a class/backfill.
   A split solution may avoid paying for broad unused datasets, but no saving or
   total price can be asserted until both quotes are known.
2. Keep EODHD as a sample-validation candidate for the three listed funds, not the
   default solution. Its published commercial floor is USD 399/month, and internal
   usage is different from delivering portfolio graphs to paying users. Enterprise
   USD 2,499/month is a list price, not proof of required instrument rights.
3. Avoid direct full order-book HistoricalView as the first choice for a daily
   portfolio graph. Its documented internal-use fees and delivery complexity do
   not resolve fund NAV, Spotlight coverage or external app licensing.

A comparable quote must answer, for each of the 21 ISINs: exact share class/MIC/SEK
listing; first/last available dates; issuer NAV or official unadjusted close;
historical date-range retrieval (including missed days, listing moves and suspensions);
valuation date vs publication timestamp; fund calendars and late/corrected NAV;
correction versions and delisted products; server caching/retention after contract
end; display and derived-performance rights in a paid app; customer-count tiers,
exchange pass-through fees, minimum term, taxes and total cost. Request a small
dated sample before acceptance. No quote or external message was sent in this task.

Fund closure evidence is distinct from an absent quote:

- Avanza Zero: reviewed issuer bank-day rule; normal publication delay two bank
  days. Specific exceptional closures still need review.
- Spiltan Investmentbolag: issuer [prospectus](https://www.spiltanfonder.se/upl/files/260326/informationsbroschyr.pdf?t=835459500)
  and [2026 calendar](https://www.spiltanfonder.se/upl/files/262046.pdf) establish
  bank-day valuation, next-bank-day publication and closures. Half days remain
  expected NAV days. The active rule begins with the reviewed prospectus date.
- Access Asien A: [Swedbank's dated notice](https://www.swedbank.se/news.e7903d95-4cc2-467d-af08-3666517e6ebd.html)
  explicitly excludes valuation on 9 October 2026. The coded rule is limited to
  that date; it is not a complete Asian holiday calendar.
- Kavaljer/LF USA: a full reviewed publication calendar is not active. A Swedish
  exchange holiday or a missing NAV must not silently authorize carry.

Late publications keep their actual valuation date. Collection can commit public
sources partially, but portfolio publication requires every position, cash and FX
source. Missing expected NAV/product dates stop the contiguous portfolio history;
no forward-fill, scaled percentage chart, underlying crypto spot or invented NAV
is used as a historical unit price. A closed day requires reviewed issuer evidence.

The local archive now mirrors into the service-only SQL cache in one transaction.
Every source correction retains its original version and invalidates fictional
public demo portfolio revisions atomically. Publication checks archive revision,
each source hash/value, journal replay, cash and recalculated SEK total under the
same database lock. This bridge is active locally only. It is not cloud staging.
Initial mirroring is capped at 500 points; larger archives require a reviewed
paginated ingestion protocol before scale-up. Stock/FX recovery currently covers
a rolling seven-day window. Missing older fund/certificate recovery remains blocked.

Decision needed: approve a source contract only after receiving coverage by ISIN,
historical unit prices/product closes, FX/index permissions, corrections/calendar
policy, retention rights, redistribution/derived-data rights, SLA and a price quote.
There is no verified universal free source or complete commercial quote for this
portfolio. Published plan/reference fees above must not be presented as pilot cost.
