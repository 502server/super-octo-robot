# PostgreSQL cutover readiness and JSON mapping

## Decision

The Express application now uses Drizzle-backed relational tables for users, workspaces, memberships, invitations, sessions, assets, indicators, alerts, findings, checks, and audit events whenever `DATABASE_URL` is configured. The repository preserves the existing callback-based application behavior while loading a consistent request snapshot and serializing transactional writes with a PostgreSQL advisory lock. Hasura remains optional and is not used by the application.

The guarded importer can read the legacy `fivezero2_app_state.payload` directly with `pnpm db:import --from-database`; it defaults to dry-run and retains the source JSONB row after import. The currently connected v0 Neon database returned zero legacy users, workspaces, and feature records in its dry-run. Production deployment uses the separate `DATABASE_URL` GitHub Actions secret for Fly, so the preview result is not evidence about the production database. Do not migrate or redirect production until that source is identified and dry-run counts are reviewed.

## Runtime-to-relational mapping

| JSON field | PostgreSQL target | Required transformation |
|---|---|---|
| `workspaces[].id` | `workspaces.id` | Must be UUID. Legacy `ws_default` is not; assign a deterministic UUID and rewrite all workspace references. |
| `users[].id` | `users.id` | Preserve valid UUIDs; deterministically remap invalid IDs and rewrite references. |
| `users[].passwordHash` | `users.password_hash` | Preserve bcrypt hash only. Never export plaintext credentials. |
| `users[].role` + `workspaceId` | `workspace_memberships` | One membership row per current user/workspace; membership is the relational role source of truth. |
| `invitations[].tokenHash` | `workspace_invitations.token_hash` | Preserve hash only; expire stale invitations during cutover. |
| `sessions[].hash` | `sessions.token_hash` | Preserve hash only; convert millisecond `expiresAt` to timestamptz. Revoke sessions if compatibility is not validated. |
| `assets[].url` | `assets.origin` | Preserve normalized origin, verification state, creator and timestamps. |
| `assets[].challenge` | `assets.verification_challenge_hash` | Never persist plaintext. Current runtime needs plaintext for DNS verification; rotate challenges and require DNS re-verification unless runtime is changed to compare hashes. |
| `iocs[]` | `indicators` | Map `mitre` to `mitre_techniques`; `sources[]` to `sources`; preserve confidence, severity, tags, notes, status and watchlist. |
| `alerts[].iocId` | `alerts.indicator_id` | Rewrite through IOC ID map; enforce workspace composite FK. |
| `alerts[].assignee` | `alerts.assignee_user_id` | JSON stores username, SQL expects membership UUID. Resolve case-insensitively within workspace; reject ambiguous/missing matches. |
| `checks[]` | `asset_checks` | Rewrite asset/workspace IDs; map `status` to `http_status`, `ok` to `reachable`, and retain `https`, `checkedAt`, error. |
| `findings[]` | `findings` | Rewrite asset/workspace/creator IDs; quarantine unsupported enum values instead of coercing them. |
| `audit[]` | `audit_events` | Map `userId` to `actor_user_id`, `at` to `occurred_at`; preserve workspace, action and detail. |

## Importer contract

The importer now exists as `scripts/import-json-to-postgres.js` and defaults to dry-run (`npm run db:import`). It builds a deterministic import plan, validates core foreign keys and enum constraints, hashes asset verification challenges, and intentionally does not copy live sessions. To apply, the operator must supply `DATABASE_URL` and explicitly pass both `--apply` and `--backup-confirmed`. The script inserts through parameterized statements in one transaction, records a source-snapshot hash to prevent re-importing the same snapshot, and rolls back on any error. It does not apply the schema automatically; the target schema must already be reviewed and installed. Do not run apply against production until staging verification and backup gates are satisfied.

The importer must remain a separate command and default to dry-run. It must read a consistent snapshot; validate identifiers, FKs, workspace ownership and enums; build deterministic ID maps before dependent inserts; report source/accepted/skipped/rejected counts; use parameterized SQL; insert in one transaction and rollback on any error; never print passwords, token hashes, API keys or challenge values; require an explicit apply flag, a separately supplied database URL and confirmed backup; and verify counts plus workspace ownership after import.

## Cutover gates

- [x] Apply the relational schema and create the import-batch marker table.
- [x] Implement a Drizzle relational store for all application collections.
- [x] Keep callback APIs compatible while using per-request database snapshots and serialized transactions.
- [x] Implement a database-sourced, transactional importer with dry-run default and explicit backup/apply gates.
- [x] Preserve sessions, OAuth identity fields, hashed password values, and workspace ownership during ID remapping.
- [x] Derive stable asset verification challenges from the server secret; store only their hashes.
- [x] Run unit tests covering legacy references, tenant-safe mappings, session preservation, and IOC validation.
- [ ] Run the importer against the actual Fly production database; the v0-connected Neon preview source returned an empty state.
- [ ] Review actual production counts, snapshot/backup availability, and every rejected row before import.
- [ ] Run integration tests for workspace isolation, invitation single-use, expiry/revocation, IOC deduplication, and concurrent writes on staging.
- [ ] Cut over production only after explicit source confirmation, import verification, and rollback testing.

Hasura is optional and remains unconfigured. The current runtime checks workspace membership in the Express service; do not expose database credentials or these tables directly to untrusted clients.
