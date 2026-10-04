# Dashboard history and daily impact

## Manual setup

Review and run `supabase/dashboard-history.sql` manually. No SQL has been executed. The revised file remains outside migrations and adds `holdings.previous_close`, `portfolio_daily_values.observed_at` and the `save_portfolio_daily_value` RPC. It supports an already-installed earlier table version. Apply the revised SQL before using this client.

RLS isolates reads. Direct authenticated writes are revoked. The security-definer RPC gets ownership from `auth.uid()`, validates inputs and has an empty search path. Callers cannot supply another user. Existing holding writes still retry without `previous_close` only for that specific missing column. Refresh quotes after setup. Yahoo source timestamps also require the separately updated Edge Function to be deployed in production; no deployment is performed here.

## Ordering and daily writes

The history hook runs in App across routes. It requires successful holdings/Lysa loads for this user, complete valuations and no collective price refresh in progress.

Observation time is captured before the two-second debounce, and increases monotonically within this browser module. Writes are serialized across hook instances. Cancelled pending observations are discarded; failed writes do not block later writes. Queued writes recheck freshness and cancellation before sending. If the debounce/queue crosses Stockholm midnight, the old-date observation is skipped and a later minute tick considers the new date.

The RPC performs an atomic `ON CONFLICT ... DO UPDATE ... WHERE existing.observed_at < excluded.observed_at`. Older observations and equal-time retries cannot overwrite the stored value, regardless of completion order. Concurrent tabs/devices are protected by the database row lock and comparison. `updated_at` is server write time, not observation order. Device clocks must be reasonably correct: cross-device order is defined by their recorded observation times, and times more than five minutes ahead of server time are rejected.

The same user/date/total/validation-input combination is not repeatedly written. A freshly verified quote set advances the observation time even if the total stays unchanged. Errors retry on a later minute tick. History is reloaded after a write, including a rejected older observation, and paginated beyond 1000 rows.

The client records dates while the app is open. The separately prepared daily server worker is described in SERVER-SNAPSHOTS.md; it only runs after an approved schema setup, deployment and cron activation. Background throttling can delay client ticks. Manual assets now use a per-user RLS-protected table, with explicit ownership confirmation before importing unassigned legacy local data. No closing snapshot or backfill is guaranteed while the worker remains inactive.

## Exact freshness rule

Every relevant position must pass immediately before a queued write executes:

- The latest quote refresh succeeded within 20 minutes, during this browser session, for this user. A pending/missing/failed latest refresh blocks the entire total. A successful fallback quote is allowed. Old global `lastPriceUpdate` cannot alone skip the initial verification.
- Quantity, price, SEK value, currency and source timestamp match the verified holding. An imported or edited value cannot reuse verification of another value. An older concurrent refresh cannot replace the latest refresh's status.
- A real source timestamp is parsable and no more than five minutes in the future. Seconds, milliseconds, ISO timestamps and date-only NAV dates are supported. Fetch time is never substituted for a missing timestamp.
- Direct crypto (CRYPTO without ISIN or ETP classification) is at most 30 minutes old. Exchange-traded instruments, including listed crypto ETPs, are at most four Stockholm calendar days old. Funds/Lysa are at most seven calendar days old. These fixed limits allow normal weekends/NAV publication delays but are not exchange-holiday calendars.
- Quantity and price are positive; `currentValueSek` is finite and nonnegative. Imported reserve `valueSek` is insufficient.

Lysa's latest funds fetch must succeed within 20 minutes and every relevant NAV date must pass the seven-day rule. One missing/failed/stale position blocks the whole snapshot. A portfolio without market-priced holdings needs no quote checks. Manual assets are not market-priced.

Freshness is rechecked each minute; the dashboard explains the first failure and points to Settings for refresh. No continuous market polling is introduced. Existing FX cache behavior is unchanged (up to 24 hours), so successful quote checks do not imply live FX.

## Exact period coverage rule

1V starts seven days before today; 1M one calendar month before; YTD January 1; 1Å one calendar year before. Month/year arithmetic clamps invalid destination days.

A fixed period is shown only when a real value exists within plus/minus three calendar days of the theoretical start, AND its latest value is today or yesterday and strictly after both the theoretical start and the selected anchor. Choose the point with the smallest absolute calendar-day distance; ties prefer the earlier date. An unrelated much older point cannot substitute. Future points cannot satisfy coverage, and one point cannot be both start and end.

Graph and percentage/amount comparison use the exact same anchor, displaying its actual date explicitly as the actual start. An earlier anchor includes up to three extra days; a later anchor shortens the period by up to three days. For example, a January 2 first observation can make YTD available. The series starts at the anchor and includes all later real observations without duplicating it. No interpolation is performed. Continuous daily coverage is not required. The line connects real observations across internal gaps. All retains its existing two-point rule and may show older history.

`createValueSeries` remains provider-independent for future index adapters. Value changes include deposits/withdrawals; return comparisons still need cash-flow tracking and a suitable benchmark model.

## Retained behavior

Daily movers still group ISINs across accounts, bridge missing ISINs through unique ticker/name aliases, and rank combined SEK price contributions. Reference value is `currentValueSek * previousClose / currentPrice`; percentage uses the combined reference value. All positions need today's source timestamp and positive current/previous prices. Lysa has no previous close and is excluded. Up to three positive and negative contributors are shown. Daily impact excludes FX's own movement and uses today's quantity.

SEK remains the base. USD/EUR converts displayed values, including historical values, with the current cached FX rate, not historical rates. Quote prices keep their original currency. Existing themes/mobile styling and index-series preparation are retained.

## Verification

Run `node --test tests/dashboardHistory.test.mjs tests/historySafety.test.mjs` and `npm run build`.

`supabase/dashboard-history-checks.sql` is a separate optional manual database test, not executed by Codex. After schema setup it checks newer-then-older writes, equal-time idempotency, a later replacement and revoked direct writes. It uses an existing auth user and rolls back all test changes. Live multi-user RLS and true concurrent database sessions still need manual Supabase validation. No migration, deployment or Git push is performed.
