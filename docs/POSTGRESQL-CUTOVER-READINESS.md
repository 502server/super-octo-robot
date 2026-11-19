# Historical PostgreSQL cutover notes

This document records the earlier Neon/PostgreSQL target plan. It is retained as migration history only and is superseded by [`migrations/README.md`](../migrations/README.md), which describes the approved MariaDB-primary architecture. Do not follow the old Neon cutover steps.

## Historical implementation

- `migrations/001_workspace_intelligence.sql` defines the prior Neon relational schema.
- The previous app store used Drizzle with PostgreSQL tables and a transaction advisory lock.
- The legacy production source is expected to contain a JSONB `fivezero2_app_state.payload` row and is selected through `FLY_DATABASE_URL` for imports.
- A previous source lookup failed because the configured Fly hostname did not resolve. Production data counts were not verified.

## Current migration status

The active application code is being moved to MariaDB. Hosted app state uses a MariaDB InnoDB JSON row protected by transactions and row locks; Better Auth uses separate MariaDB auth tables. The guarded importer reads the legacy PostgreSQL state and writes only to MariaDB. Production has not been cut over, and Fly/Neon must remain available until a verified source export, target import, Preview checks, and rollback path are complete.

See `migrations/README.md` for the current setup commands, environment requirements, import safeguards, and cutover checklist.
