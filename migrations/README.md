# PostgreSQL / Hasura migration plan

## Status

`migrations/001_workspace_intelligence.sql` defines the first relational schema for workspace identity, membership, invitations, sessions, authorized assets, IOC records, alerts, asset checks and audit events.

**It has not been applied to Hasura.** The live Express application still reads and writes `data/state.json`. Do not assume that adding this SQL file switches the running app to PostgreSQL.

## Apply safely

1. Take a backup/snapshot of the Hasura project's PostgreSQL database.
2. Confirm the target Hasura project and database are the intended environment.
3. Review the SQL with a database administrator.
4. Apply the migration once through the Hasura SQL console or a controlled migration pipeline.
5. Track the applied migration version outside the application.
6. In Hasura, track the tables and configure relationships and permissions before exposing them through GraphQL.

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
