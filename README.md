# fivezero2.group

Defensive asset inventory and security posture dashboard for systems you own or are explicitly authorized to assess.

## Features
- Owner bootstrap and session authentication.
- Asset inventory with DNS TXT ownership proof.
- Passive HTTP/TLS availability checks using ordinary GET requests.
- Findings triage, scan history, audit log, and dashboard.
- Security headers, rate limiting, request validation, and origin checks.
- PostgreSQL-backed application state when `DATABASE_URL` is configured; local JSON remains available for development.

## Quick start
Requires Node.js 20+.

```sh
cp .env.example .env
npm install
npm start
```
Open http://localhost:3000. Set unique long values for BOOTSTRAP_TOKEN and SESSION_SECRET before starting. Without DATABASE_URL, local state is stored in data/state.json. With DATABASE_URL, PostgreSQL is authoritative and the existing JSON file is imported into the database on first initialization if the database state table is empty.

## PostgreSQL runtime
- Configure `DATABASE_URL` with the Fly Managed Postgres **PgBouncer** connection string. Do not commit it or put it in frontend configuration.
- The Express runtime uses the relational tables in `migrations/001_workspace_intelligence.sql` through Drizzle ORM. Database reads are request-scoped snapshots; writes use a PostgreSQL transaction and advisory lock.
- Before switching a database that contains `fivezero2_app_state`, run `pnpm db:import --from-database` as a dry-run. Apply only after reviewing counts and securing a restorable backup: `pnpm db:import --from-database --apply --backup-confirmed`.
- The importer preserves password hashes and valid hashed sessions, remaps legacy IDs deterministically, validates tenant references, and never copies raw asset challenges or session tokens. The JSONB row is retained as a rollback copy.
- A non-empty legacy JSONB row blocks app startup until the guarded import is complete. An empty database can start cleanly and use the relational store directly.
- The GitHub Actions workflow supplies Fly's `DATABASE_URL` independently of this v0 preview's connected Neon environment. Verify the actual deployment secret and source database before any production migration; a dry-run from one environment is not proof it is the production database.

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

## Fly.io deployment

The configured production target in `fly.toml` is Fly.io app `fivezero2-group-7777` in region `iad`. The deploy workflow must target the same app and region. Pushes to `main` run tests and deploy only when all required GitHub Actions secrets are configured.

Add these secrets in GitHub **Settings → Secrets and variables → Actions**:
- `FLY_API_TOKEN`: app-scoped Fly deploy token.
- `DATABASE_URL`: Fly Managed Postgres PgBouncer URL (runtime connection only).
- `SESSION_SECRET`: random value of at least 32 characters.
- `BOOTSTRAP_TOKEN`: separate random value of at least 24 characters.

The workflow stages DATABASE_URL, SESSION_SECRET, and BOOTSTRAP_TOKEN as Fly app secrets, then deploys. A green test run alone does not prove that the live app is healthy; verify `/api/health`, login, and persisted writes after deployment. Rotate any credential that has been pasted into chat or otherwise exposed.
