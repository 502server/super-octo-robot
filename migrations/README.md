# MariaDB setup

MariaDB is the new primary database target. The Express application stores the shared workspace state in `fivezero2_app_state` and uses InnoDB row locks and transactions for cross-instance writes. Better Auth stores OAuth users, accounts, sessions, and verification records in its own MariaDB tables.

## Initialize a fresh target

Configure a rotated, TLS-verified `MARIADB_URL` in the environment, including the database name. Then run:

```sh
pnpm db:migrate:mariadb
pnpm db:auth:migrate
```

The first command creates the application state table and an empty singleton row. The second runs Better Auth's built-in MySQL/MariaDB migration using `backend/auth.js`. These setup commands are safe to repeat.

## Verify a fresh environment

- Keep `MARIADB_URL` server-only and use a TLS-verified SkySQL connection.
- Run both MariaDB initialization commands above before starting the app.
- Verify bootstrap/login, OAuth, and feature reads/writes on Vercel Preview before enabling Production.
- Never commit or log database URLs or secrets.
