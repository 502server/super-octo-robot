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

- Configure `MARIADB_URL` with a `mysql://` or `mariadb://` URL that includes the database name. The driver always verifies TLS certificates. SkySQL hosts (`*.skysql.com`) use the bundled SkySQL CA chain; `MARIADB_SSL_CA` can override it when the provider supplies a different CA. Never expose connection credentials to browser code.
- Initialize a fresh MariaDB target with `pnpm db:migrate:mariadb` and `pnpm db:auth:migrate` before first use.
- The Express app stores feature state in MariaDB using InnoDB transactions and row locks. Better Auth uses the same MariaDB pool for its authentication tables.

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
- `MARIADB_SSL_CA`: optional provider CA PEM override; SkySQL hosts use the bundled CA chain by default.
- `SESSION_SECRET`, `BETTER_AUTH_SECRET`, and `BOOTSTRAP_TOKEN`: unique, strong secrets.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` when those OAuth providers are enabled.
Before enabling Production, initialize the MariaDB schema and verify authentication and feature reads/writes in Preview.
