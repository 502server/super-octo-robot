# Fly.io deployment — Fivezero2.group / 502offensive

## Current repository deployment configuration

The repository now contains:

- `fly.toml`: Fly app configuration for the existing Node.js 20 / Express Dockerfile.
- `.github/workflows/fly-deploy.yml`: tests on GitHub Actions and deploys to Fly.io on pushes to `main`.
- A persistent Fly Volume named `app_data`, mounted at `/app/data`, for the current JSON store.

The configured app name is `fivezero2-502offensive`; the primary region is Singapore (`sin`). Fly app names are globally unique. If that name cannot be created, choose another name in the Fly dashboard and update the `app` value in `fly.toml` and `FLY_APP` in the workflow to match.

## What I changed vs what remains

**Committed to GitHub:** deployment configuration and CI/CD workflow only.

**Not yet done:** no Fly app, volume, Machine, IP address, domain, or Tailscale device has been created. A workflow run without `FLY_API_TOKEN` deliberately skips deployment. It will test the repo and report that deployment was skipped.

## One-time account setup (dashboard only; no local terminal required)

1. Open the [Fly.io dashboard](https://fly.io/dashboard) and create an app named `fivezero2-502offensive` in Singapore (`sin`). Do not create a second app if this exact app already exists.
2. Open that app's **Tokens** page and create an app-scoped **deploy token**. Do not use a full personal account token.
3. In the GitHub repository, open [Settings → Secrets and variables → Actions](https://github.com/enterprisezylora-hash/Fivezero2.group/settings/secrets/actions) and add a repository secret named `FLY_API_TOKEN` containing the deploy token. Preserve the full `FlyV1 ...` value if Fly presents that prefix.
4. Ensure the existing GitHub Actions secrets `SESSION_SECRET` (at least 32 characters) and `BOOTSTRAP_TOKEN` (at least 24 characters) are present and contain fresh, unique values. The workflow stages these into Fly before deployment. Do not paste them into chat or commit them.
5. Once the app and secret are configured, the next push to `main` runs tests, ensures the encrypted 1 GB volume exists in `sin`, stages the two required app secrets, then deploys the Docker image.

The workflow uses an app-scoped deploy token. Fly documents these tokens as limited to managing one app and its associated resources, including volumes and secrets. A 1 GB Fly Volume has a published storage charge; compute, bandwidth, and other resources may add cost. Review [Fly.io pricing](https://fly.io/docs/about/pricing/) before leaving the app running.

## Application behavior and persistence

- The current app listens on `0.0.0.0:3000`; Fly's public HTTPS proxy forwards to port 3000.
- Fly health checks call `GET /api/health`.
- Current persistence is JSON in `data/state.json`. The workflow mounts `app_data` at `/app/data` and sets `DATA_FILE=/app/data/state.json`.
- Keep a single app Machine for this file-backed store. Do not scale horizontally until the JSON store is migrated to a shared database with tested migrations and backup/restore.
- The Dockerfile runs as the non-root `node` user. Verify the first deployment can write to the mounted volume; Fly volume mount ownership must be compatible with the image user. A permission error must be fixed before owner bootstrap or production use.
- The app refuses to start unless `SESSION_SECRET` and `BOOTSTRAP_TOKEN` are configured. The workflow validates them without printing their values.
- Hasura is currently only a health/connectivity integration, not the app's persistence layer. DeepSeek/Hasura secrets are not needed for this first deployment.

## Tailscale scope

This first Fly deploy is the **web application only**. It does not install Tailscale or advertise an exit node.

Tailscale's Fly.io guide documents joining an app to a tailnet for private app-to-service communication. Advertising a true exit node additionally requires packet forwarding, NAT/firewall behavior, approval in the Tailscale admin console, and tailnet policy access to `autogroup:internet`. A separate Fly Machine and a platform-level test are needed before promising exit-node functionality. Do not expose an unrestricted public proxy or relay.

References:
- [Fly.io: Continuous deployment with GitHub Actions](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)
- [Fly.io: App configuration](https://fly.io/docs/reference/configuration/)
- [Fly.io: Access tokens](https://fly.io/docs/security/tokens/)
- [Fly.io: Pricing](https://fly.io/docs/about/pricing/)
- [Tailscale: Tailscale on Fly.io](https://tailscale.com/docs/install/cloud/flydotio)
- [Tailscale: Exit nodes](https://tailscale.com/docs/features/exit-nodes)
