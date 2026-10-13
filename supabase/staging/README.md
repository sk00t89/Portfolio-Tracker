# Staging review package — not an executable cloud migration

Current integration assessment (13 October 2026):
[end-to-end staging plan](end-to-end-plan.sv.md). The revised foundation and
two-user cloud isolation test were completed in earlier approved steps; the
test accounts and rows were cleaned up. The historical preflight notes below
describe those earlier approval stages, not the current migration status.
The staging runtime, app transport and deployment are still pending.

The local runtime/client preparation is now available in
[002-runtime.review.sv.md](002-runtime.review.sv.md), with the exact standalone
[approval SQL](002-runtime.approval.sql) and [E2E test plan](end-to-end-test.sv.md).
These new cloud steps have not been approved or run.

No cloud project has been modified by this package. The SQL under `supabase-test/` is
intentionally guarded by `portfolio_tracker.test_only` and is not a production
migration. Keep those guards. Do not run `supabase db push` from this repository.

Owner instructions: [create an empty staging project](create-project.sv.md).
The owner has now supplied staging ref `vutjthqlgzokeylaxpzp`. Review the
[first-step approval draft](next-step.sv.md) before any cloud action. Its SQL
is deliberately outside automatic migrations and has only been rehearsed locally.
The cloud preflight stopped at the project's existing automatic-RLS function.
See the [read-only review and revised approval draft](auto-rls-review.sv.md).
The original approval does not authorize the revised file or a cloud run.
Start with synthetic portfolios **and synthetic market data**. Paid market data
is not a prerequisite for staging's technical tests; real-data pilot acceptance
remains blocked separately. No external resource is created by our local scripts.

## Focused readiness review

| Part | Verified locally | Exact work before cloud staging use |
| --- | --- | --- |
| DDL installation | `npm run test:local-migrations` applies all six reviewed files atomically to a fresh local scratch database; injected error leaves no partial tables/functions | Derive a separate versioned migration with a staging-only environment guard and exact approved project identity. Keep local guards intact. No cloud-ready migration is claimed. |
| RLS / RPC | Seven RLS tables, seventeen functions; two synthetic owner identities isolated; read-only security audit passes | Recheck owners/grants/functions with managed Supabase Auth and two separate authenticated test users. Scratch Auth is only a SQL dependency stub, not a login-service test. |
| Import / trade / history | Existing local synthetic flows and atomic ledger RPCs | Configure a dedicated staging server/transport and synthetic instrument/provider registry. Existing local client/API origins deliberately reject cloud projects; do not loosen those guards or reuse production keys. |
| Activation / jobs | Local worker can use fictional portfolios | Staging-only origin allowlist, closed signup/test-user allowlist, independent secrets and explicit environment check. Start scheduler and real-user activation off; later enable only the synthetic staging job. Never deploy the development branch to production. |
| Backup / restore | Encrypted local public+Auth restore and eleven table fingerprints | Separate retained encryption keys/backup storage; restore into a separate approved target with jobs off. Recheck role owners, Auth login, Storage objects, secrets and scheduling. Local rehearsal does not prove managed-cloud recovery. |

The fresh-database migration rehearsal creates only a uniquely named database in
the verified local Docker container. It uses a minimal `auth.users` / `auth.uid()`
dependency stub and the cluster's existing roles, and checks original baseline,
holdings and snapshot fingerprints. It never resets the existing stack, accepts
remote credentials or removes a database. Scratch databases remain for inspection.
The local backup test also leaves its separate restored database for inspection.

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

Stage the synthetic chain independently of market-data purchasing. For a later
real-data pilot, verify licensed sources and missing-date recovery and collect at
least one real trading week. Verify late NAV,
closures, source corrections, stopped collector/retry, backdated trades, backup
and restore. This cannot be replaced with replaying five historical days today.

Production requires a separate presentation and approval, verified backup and
restore evidence, exact migration diff, source/cost matrix, one-user allowlist,
shadow calculation, explicit dated opening balance and a kill switch. No old
transactions are required. Never discard journal events during rollback.
