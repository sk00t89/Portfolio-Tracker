# Local read-only security audit

Run `npm run test:local-security` from the repository root with the isolated
Docker/Supabase stack running. The existing environment guard verifies the exact
local container, database port and absence of a remote project link. SQL runs in
a read-only transaction and ends with rollback. No migration, credentials read,
portfolio import or database write is performed.

The audit checks the seven ledger/history/cache tables and seventeen functions
declared in the six reviewed proposal/runtime files. It verifies RLS, exact
owner-read policy expressions, client read/write grants, service permissions,
PUBLIC/anonymous RPC grants, fixed search paths, expected invoker/definer modes,
local privileged owners, missing functions and unexpected overloads. A policy
containing `auth.uid()` plus `OR true` is rejected. The owner-read RPC must remain
security invoker. The anonymous environment RPC is the explicit exception.

Printed SHA-256 values fingerprint the local SQL files with normalized line endings.
They do not attest that deployed function bodies match those files. The role-owner
requirements describe this local test stack, not a general database recommendation.
This catalog audit complements the existing two-user RLS, atomicity, rollback and
revision integration tests; it does not replace them or prove all payload validation.

Validation: 350 unit tests and lint passed; the live read-only audit passed against
the isolated local database. No SQL/schema or application UI changes were needed.
