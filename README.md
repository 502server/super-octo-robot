# fivezero2.group

Defensive asset inventory and security posture dashboard for systems you own or are explicitly authorized to assess.

## Features

- Owner bootstrap and session authentication.
- Asset inventory with DNS TXT ownership proof.
- Passive HTTP/TLS availability checks using ordinary GET requests.
- Findings triage, scan history, audit log, and dashboard.
- Security headers, rate limiting, request validation, and origin checks.
- MariaDB-backed transactional application state and Better Auth tables in hosted environments; local JSON remains available for development.

## Quick start

Requires Node.js 20+.

```sh
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000. Set unique long values for BOOTSTRAP_TOKEN and SESSION_SECRET before starting. Without MARIADB_URL, local development state is stored in data/state.json. With MARIADB_URL, run `pnpm db:migrate:mariadb` and `pnpm db:auth:migrate` first; MariaDB is authoritative and local-file fallback is disabled in hosted environments.

## MariaDB runtime

- Configure `MARIADB_URL` with a `mysql://` or `mariadb://` URL that includes the database name. The driver always verifies TLS certificates; use `MARIADB_SSL_CA` only if the provider's CA is not in the system trust store. Never commit these values or expose them to browser code.
- `LEGACY_POSTGRES_URL` is a temporary PostgreSQL source-only setting for the guarded import; the application runtime never reads it.
- The Express app stores all feature state in one MariaDB JSON row and performs each update inside a transaction with `SELECT ... FOR UPDATE`, so concurrent Vercel instances do not overwrite each other's updates. Better Auth uses the same MariaDB pool for its separate auth tables.
- Initialize with `pnpm db:migrate:mariadb` and `pnpm db:auth:migrate`. The guarded importer can read from `LEGACY_POSTGRES_URL` and writes only to MariaDB.
- Dry-run before importing: `pnpm db:import -- --from-database`. Apply only after reviewing counts and securing a restorable backup: `pnpm db:import -- --from-database --apply --backup-confirmed`. The importer validates tenant references, preserves IDs and password/session hashes, never exports raw session tokens, and refuses to overwrite non-empty MariaDB state.
- Keep the legacy source database and rollback snapshot available until Vercel Preview and Production persistence, login, OAuth, and feature flows are verified; do not point Production at an empty target.

## API

GET /api/health, POST /api/auth/bootstrap, POST /api/auth/login, POST /api/auth/logout, GET /api/me, GET/POST /api/assets, POST /api/assets/:id/verify, POST /api/assets/:id/check, GET /api/findings, PATCH /api/findings/:id, GET /api/audit.

## Safety

Checks require verified DNS ownership and are limited to passive HTTP(S) GET requests. Private and loopback targets are blocked. Static security review is not included in this initial deployable baseline. Use only on authorized assets. Use HTTPS behind a trusted reverse proxy in production.

## Integration credentials and status

The authenticated dashboard exposes `/api/integrations/status` and backend-only connection tests for DeepSeek and Hasura. It reports whether credentials are present and whether a test succeeds; it never returns credential values.

Configure these values in the deployment environment or secret manager (not in browser code and not in Git):

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` (default `deepseek-chat`)
- `HASURA_GRAPHQL_ENDPOINT`
- `HASURA_ADMIN_SECRET`
- `HASURA_JWT_SECRET` (presence is reported; JWT issuance is not implemented in this MVP)

Never paste secrets into chat, commit them, or expose them to frontend JavaScript. GitHub access is managed by the GitHub App connector and is not configured with a repository PAT in this application.

## Vercel + MariaDB deployment

The application exports its Express handler from the repository root for Vercel, and Vite builds static assets into `public/`. Hosted app state and Better Auth use MariaDB through the same TLS-verified `MARIADB_URL` pool.

Configure these server-only variables in the Vercel project for Preview and Production:

- `MARIADB_URL`: rotated MariaDB connection URL including the database name.
- `MARIADB_SSL_CA`: optional provider CA PEM, only if required to validate the server certificate.
- `SESSION_SECRET`, `BETTER_AUTH_SECRET`, and `BOOTSTRAP_TOKEN`: unique, strong secrets.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` when those OAuth providers are enabled.
- `LEGACY_POSTGRES_URL`: temporary source-only PostgreSQL URL for the guarded import; remove it after migration verification.

The production cutover is not complete until source data has been imported, counts and tenant references have been verified, and auth plus feature writes pass in Preview and Production. Keep the existing production service, legacy source database, and rollback snapshot available until then.
