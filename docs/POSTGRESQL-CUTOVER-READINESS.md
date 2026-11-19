# PostgreSQL cutover readiness and JSON mapping

## Decision

The Express application connects to Neon when `DATABASE_URL` is present, but `api/store.js` stores the entire application state in one `public.fivezero2_app_state.payload` JSONB row. The relational schema in `migrations/001_workspace_intelligence.sql` is now applied to Neon, but its tables are not yet used by application routes and have not been backfilled. Hasura is not connected or configured; it is optional for the selected Neon architecture. Do not claim a relational cutover until repositories, data backfill, and isolation tests are complete.

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

- [ ] Apply reviewed schema to a backed-up non-production database.
- [ ] Configure Hasura relationships, row permissions, JWT claims and workspace filters.
- [ ] Implement hashed asset-challenge verification.
- [x] Add a transactional importer with dry-run default and explicit apply gate.
- [ ] Implement async PostgreSQL repositories behind an explicit feature flag; JSON remains default.
- [ ] Test cross-workspace denial, invitation consumption, session expiry/revocation, IOC deduplication and concurrent writes.
- [ ] Dry-run importer against a copy of real JSON data; resolve all rejected rows.
- [ ] Import to staging, compare counts and run integration tests.
- [ ] Back up production, freeze writes, import, verify, then switch traffic.
- [ ] Keep a tested rollback path until the rollback window closes.

## Known blockers

- The importer uses the `pg` driver, but no application repository adapter exists.
- Routes use synchronous `read()` and callback-based `write()`; PostgreSQL is asynchronous and requires a deliberate repository/service refactor.
- Legacy `ws_default` is not a UUID.
- Asset verification currently uses a plaintext challenge in JSON.
- Alert assignees are usernames, but SQL expects a membership UUID.
- Hasura metadata and row-level permissions are not included in SQL.
- The current app supports one workspace per user; the schema supports many-to-many memberships.

JSON remains the only active persistence backend until these blockers are resolved.
