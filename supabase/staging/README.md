# Staging review package — not an executable cloud migration

No cloud project has been created or modified. The SQL under `supabase-test/` is
intentionally guarded by `portfolio_tracker.test_only` and is not a production
migration. Keep those guards. Do not run `supabase db push` from this repository.

Review the local installation order:

1. `supabase/proposals/portfolio-performance-v1.sql`: isolated baseline, journal,
   observations and owner-read RPC. Never modifies legacy holdings/snapshots.
2. `supabase-test/performance-runtime.sql`: local guard, atomic trade/cash/revision.
3. `supabase-test/history-stage.sql`, `cash-stage.sql`: import receipts, correction
   audit, cache, worker status and service-only publication.
4. `supabase-test/market-archive.sql`, `public-market-stage.sql`: immutable source
   versions and atomic revision checks. Public-source publication additionally
   requires fictional Auth accounts and the explicit fictional-demo marker.

Before a cloud staging migration can be approved, derive a separate reviewed
additive migration: explicit environment/project identity, server-owned instrument
catalog and licensed source registry, complete opening/cash evidence validation,
service-only source writes, owner RLS, fixed function search paths and immutable
history. Removing local guards is not this migration. New schema belongs in a
separate project; production project credentials must not be copied into it.

The owner needs to create an **empty** Supabase staging project with new credentials,
in the chosen organization/region/plan. Do not clone production data. Supply only
its non-secret project ref for review; keys belong in staging server secret storage,
never chat, Git or frontend environment. Scheduler and real-user allowlist start off.
Cloud costs and backup/PITR availability must be confirmed for the selected plan.

Local backup rehearsal: `npm run test:local-restore` creates an encrypted synthetic
public+Auth schema dump and restores into a newly named database in the verified
local Docker container. It compares eleven table fingerprints, RLS and RPC grants.
Its key exists only during the rehearsal; the retained encrypted file is not a
usable long-term backup. Local cluster roles are reused; Storage, role-owner
restoration, PITR, cloud secrets and scheduler recovery remain staging acceptance
tests. Scheduler must stay disabled in a restore environment.

After licensed sources and missing-date recovery are verified, stage the full
synthetic chain and collect at least one real trading week. Verify late NAV,
closures, source corrections, stopped collector/retry, backdated trades, backup
and restore. This cannot be replaced with replaying five historical days today.

Production requires a separate presentation and approval, verified backup and
restore evidence, exact migration diff, source/cost matrix, one-user allowlist,
shadow calculation, explicit dated opening balance and a kill switch. No old
transactions are required. Never discard journal events during rollback.
