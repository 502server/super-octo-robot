# MariaDB cutover

MariaDB is the new primary database target. The Express application stores the shared workspace state in `fivezero2_app_state` and uses InnoDB row locks and transactions for cross-instance writes. Better Auth stores OAuth users, accounts, sessions, and verification records in its own MariaDB tables.

## Initialize a fresh target

Configure a rotated, TLS-verified `MARIADB_URL` in the environment, including the database name. Then run:

```sh
pnpm db:migrate:mariadb
pnpm db:auth:migrate
```

The first command creates the application state table and an empty singleton row. The second runs Better Auth's built-in MySQL/MariaDB migration using `backend/auth.js`. These setup commands are safe to repeat.

## Import the legacy production state

`LEGACY_POSTGRES_URL` is read only by the one-time importer as a PostgreSQL source. It is never used by the application runtime. First run a dry-run and review the collection counts and validation warnings:

```sh
pnpm db:import -- --from-database
```

Only after securing and verifying a restorable source backup, apply the import:

```sh
pnpm db:import -- --from-database --apply --backup-confirmed
```

The importer validates tenant references, preserves app IDs and existing password/session hashes, refuses to overwrite a non-empty MariaDB target, and writes all app state in a single transaction. It does not modify the PostgreSQL source. A local JSON export can be imported by passing its path instead of `--from-database`.

## Cutover checklist

- Rotate any credential disclosed outside the secret manager; never commit or log database URLs.
- Verify the MariaDB CA chain; TLS server verification is mandatory (`rejectUnauthorized: true`). Provide `MARIADB_SSL_CA` only when the provider CA is not in the system trust store.
- Confirm the target schema and Better Auth tables exist.
- Confirm source backup, dry-run counts, and the exact production source before applying.
- Test bootstrap/login, OAuth, invitations, workspace roles, assets, checks, findings, indicators, alerts, and audit persistence on Vercel Preview.
- Switch Production only after end-to-end persistence passes; retain the legacy source and rollback snapshot until the rollback window closes.

`001_workspace_intelligence.sql` is the historical PostgreSQL/Neon relational schema. It is not used by the MariaDB runtime and must not be applied to MariaDB. The legacy PostgreSQL database remains a source-only dependency until its data import is verified.
