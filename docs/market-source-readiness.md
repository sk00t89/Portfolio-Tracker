# Public source coverage and licensing — 11 October 2026

Code and synthetic portfolios may be pushed; the complete real-portfolio pilot is
still blocked by source coverage and permission to use/redistribute market data.
No paid source has been purchased, and no new external account has been created.

| Source | Verified locally | Missing before pilot | Cost/terms |
| --- | --- | --- | --- |
| Avanza/Nordnet public endpoints | Dated latest fund NAV matched to ISIN/class/SEK; own listed certificate prices matched to identity/session | Reliable dated recovery API for all five funds and 16 certificates; documented retention/correction rules and service contract | No charges incurred; production access, redistribution rights and price/SLA unconfirmed. A public webpage is not an API licence. |
| Yahoo | Actual daily stock closes and OMXS30/S&P 500 history; rolling stock recovery window | Licensed delivery/display/derived-data permission and corporate-action verification | [Yahoo's provider notice](https://au.help.yahoo.com/kb/finance-for-web/exchanges-cover-sln2310.html) prohibits redistribution. A personal subscription is not assumed to license this app. Do not publish fetched datasets in Git. |
| Frankfurter / ECB | Dated historical USD/SEK, actual source dates, reviewed TARGET closures, corrections/versioning | Operational availability monitoring and selected-provider legal review | [Frankfurter terms](https://frankfurter.dev/license/) distinguish open-source code from provider data terms. [ECB reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html) permits reuse subject to attribution/disclaimers. No subscription paid; reference rates never substitute broker settlement. |
| Pensionsmyndigheten | Official archive candidate and LF USA Index ISIN identified | XLSX identity/date/price validation, class coverage, distribution adjustments and reuse rights before ingesting | [Official statistics](https://www.pensionsmyndigheten.se/statistik-och-rapporter/statistik/statistik-for-premiepension) publishes historical fund unit-price files and warns current verified prices lag 1–2 days and are not distribution-adjusted. Not yet an active adapter; not assumed to cover all holdings. |
| Lysa | Public latest records exist | Actual classes/dated historical NAV and publication evidence | No authenticated account or user's holdings accessed; licence/cost and full historical coverage unconfirmed. |

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
There is no verified universal free source or established paid price to promise.
