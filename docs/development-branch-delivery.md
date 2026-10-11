# Development branch delivery — 11 October 2026

Branch: `codex/verified-portfolio-pilot`. No production database change, real
portfolio import, cloud environment creation, deployment or real-user activation.
Vercel automatic deployment is disabled for this exact branch in `vercel.json`.
No deploy workflow has been added. Feature activation remains local-only.

Completed locally:

- Current synthetic CSV imports, account/cash reconciliation, verified opening
  balance and 0% anchor; no old transactions required.
- Simple trade form, actual broker SEK settlement vs existing currency cash,
  USD/SEK fees exactly once, GAV, cash-flow adjustment, atomic corrections.
- Verified public-source archive mirrored into SQL and consumed by fictional
  app portfolios. Source versions/revisions and portfolio publication share a
  lock; stale or incomplete batches fail atomically. No per-user market fetch.
- Stock and ECB seven-day rolling recovery; late NAV retries, explicit waiting
  on missing expected data. Genuine missing fund/certificate history is not
  recovered from today's quote and is still an external source blocker.
- Reviewed Avanza Zero rule, Spiltan bank-day/closure rule and specifically
  Access Asien's no-NAV day on 9 October. Other fund calendars remain partial.
- One overview, responsive mobile UI, persistent period/index preference.

Passed today: 347 unit tests, lint, normal build, isolated test build, DB/RLS/
concurrency/rollback, CSV/history, actual FX settlement, main flow, HTTP isolation,
public-file history, public-database history, all demo graphs/index overlays and
encrypted local backup/restore (eleven matching table fingerprints). Existing
large-bundle warning remains. Historical replay plus synthetic late-NAV tests
does not verify several future operating days.

Pilot blockers and required decisions:

1. Confirm a licensed source's coverage for each fund/certificate ISIN, dated
   prices, calendars, corrections and missed-day recovery. Public access is not
   redistribution permission. No paid price/SLA is established. See
   [source matrix](market-source-readiness.md).
2. Owner creates an empty separate Supabase staging project, chooses organization,
   region and plan, and supplies its non-secret project ref. Credentials must
   be separate server secrets; do not clone production data. Cloud configuration
   is unavailable here; no staging project is claimed to exist.
3. Approve the exact derived staging migration after review. Local SQL is guarded
   test infrastructure, not a drop-in cloud migration. See
   [staging package](../supabase/staging/README.md).
4. Run at least a real trading week on staging with synthetic portfolios,
   missing/suspended data, retries and corrections; verify full backup/restore,
   role owners, Auth/Storage and a disabled restore scheduler.
5. Separate production/pilot approval, backup, dated opening/cash reconciliation,
   one-user allowlist and shadow calculation before actual graph activation.

Git excludes environment files, local source archives/reports, backup/restore
artifacts, screenshots, demo credentials and actual export rows. Only source,
synthetic fixtures, guarded SQL, tests and documentation belong in this delivery.
The staged safety scan is a complement to manual review, not a guarantee against
every possible secret or personal-data shape.
