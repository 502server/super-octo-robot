# PostgreSQL / Hasura migration plan

## Status

`migrations/001_workspace_intelligence.sql` defines the relational schema for workspace identity, membership, invitations, sessions, authorized assets, IOC records, alerts, findings, asset checks and audit events.

The additive schema has been applied to the connected Neon database. Hasura is not connected or configured. The live Express application still uses `public.fivezero2_app_state` as its canonical store (a single JSONB state document); the new relational tables are not yet the application's read/write path. Applying this DDL did not migrate existing application data or switch traffic.

## Remaining cutover steps

1. Take and verify a Neon snapshot before importing or switching active data.
2. Implement and test relational repositories against the current auth, workspace and feature behavior.
3. Backfill the existing JSONB state with deterministic ID mapping; verify counts, references and workspace isolation.
4. Switch application reads/writes only after staging and rollback tests pass.
5. Keep the JSONB snapshot until the rollback window closes.

Hasura is optional for the chosen Neon architecture. If added later, track tables and configure workspace-scoped permissions and relationships before exposing GraphQL; never expose its admin secret to the browser.

## Required Hasura permissions

Use workspace-scoped row filters for every tenant-owned table:

- Read/update/delete: `workspace_id = X-Hasura-Workspace-Id`.
- Membership visibility: the active user must have a row in `workspace_memberships` for that workspace.
- Role-specific permissions: viewer read-only; analyst operational IOC/alert/asset actions; admin membership and integration administration; owner-only ownership and admin grants.
- Prevent clients from setting `created_by`, `actor_user_id`, `role=owner`, audit timestamps or workspace IDs arbitrarily.
- Make `audit_events` insert-only for the application; deny update/delete.
- Use a Hasura server-side role or trusted backend for invitation consumption and session writes. Never expose the Hasura admin secret to the browser.

Hasura permission metadata and JWT claims are not included in this SQL migration. They must be configured and tested separately.

## Application cutover still required

- Add a PostgreSQL driver and connection pooling in the Express backend.
- Implement repositories for users, memberships, invitations, sessions, assets, indicators, alerts and audit events.
- Build a one-time JSON-to-PostgreSQL importer with deterministic ID mapping, dry-run mode, counts and rollback plan.
- Keep writes disabled during final import; verify row counts and workspace ownership before switching traffic.
- Test cross-workspace read/write denial, session revocation, unique IOC deduplication and backup/restore.
- Only after those tests pass should `DATA_FILE` be retired and the JSON store removed from production.

## Important design notes

- The schema uses composite foreign keys to prevent an alert from referencing an IOC or assignee in another workspace.
- The current application has one workspace per user. The relational schema supports memberships as a many-to-many relation, but the UI's workspace switching and multi-membership session selection are not implemented yet.
- Invitation token hashes are stored, not raw invitation tokens.
- No plaintext passwords, leaked credentials or external API secrets belong in these tables.
