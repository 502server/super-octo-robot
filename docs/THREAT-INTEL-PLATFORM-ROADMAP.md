# Threat Intelligence Platform — Product and Engineering Roadmap

This document turns the requested capability blueprint into an implementable product plan. It is a defensive threat-intelligence and attack-surface management platform for assets and workspaces the operator owns or is explicitly authorized to monitor. It is not a claim of feature parity with Hunt.io.

## Product principles

- Authorized scope only: every monitored asset must be verified or have an auditable authorization record.
- Evidence-first: preserve source, collection time, first/last seen, confidence, analyst notes and provenance.
- Human approval for consequential actions: blocklisting, takedown requests, credential resets and external notifications require explicit review.
- Safe collection: public passive sources and authenticated customer telemetry only. No credential testing, exploit execution, unauthorized access, or indiscriminate dark-web crawling.
- Tenant isolation and least privilege before multi-customer production.
- Secrets stay in server-side secret managers; never in Git, browser storage, or logs.

## Current implementation (repository state)

### Implemented baseline
- Initial workspace record and legacy-data migration: existing single-tenant JSON records are assigned to a default workspace at startup.
- Workspace-scoped API reads and writes for assets, findings, IOC records, alerts, summaries and audit events.
- RBAC roles: owner, admin, analyst and viewer. Viewers are read-only; analysts can operate assets/IOCs/alerts; admin/owner manage invitations and member roles; only owner can grant admin.
- One-time workspace invitation tokens are random, stored hashed, expire after 24 hours, are single-use, rate-limited and capped at 25 pending invitations per workspace.
- Workspace dashboard for viewing members, creating invitations and changing eligible member roles.
- Integration connection tests are restricted to owner/admin.
- Node/Express API, static dashboard, owner bootstrap/login, signed HttpOnly session cookie, bcrypt password hashes, rate limits, security headers, request validation and audit events.
- Asset inventory, DNS TXT ownership verification, passive HTTP GET check, finding status updates.
- Integration status and backend connectivity checks for DeepSeek and Hasura.
- New authenticated `/api/intel` endpoints:
  - `GET /summary`
  - `GET /iocs?q=&type=`
  - `POST /iocs` with type validation, deduplication, confidence, tags, source and MITRE technique identifiers
  - `PATCH /iocs/:id` for watchlist/status/confidence/notes
  - `GET /alerts`, `POST /alerts`, `PATCH /alerts/:id`
- Dashboard panels for IOC intake/watchlist and alert triage.
- Unit tests for IOC indicator validation.

### Not implemented / not production-ready
- Real external threat feeds, commercial feed licensing, dark-web monitoring, credential leak acquisition/validation, passive DNS, certificate transparency ingestion, historical WHOIS, malware detonation, YARA execution, Sigma evaluation, SIEM telemetry ingestion, STIX/TAXII, SSO, multi-workspace membership/switching, email invitation delivery, verified work-email checks, notification delivery, scheduled reports, and SOAR actions.
- IOC confidence is analyst-supplied metadata, not a computed reputation score.
- MITRE technique IDs are validated syntactically; no ATT&CK catalog mapping or coverage engine yet.
- Hosted persistence uses MariaDB transactions and row locks; local JSON persistence remains development-only.
- All authenticated API routes currently use the initial owner/session model; role-based authorization and workspace isolation are still required.

## Architecture target

```
Browser dashboard
  -> HTTPS reverse proxy / API gateway
  -> Express API
       -> AuthN/AuthZ + workspace policy
       -> IOC and entity service
       -> Asset / exposure service
       -> Alert correlation and case service
       -> Hunt / detection service
       -> Integration and webhook service
       -> Audit and reporting service
  -> MariaDB on SkySQL (authoritative application data)
  -> Object storage (reports, evidence, feed snapshots)
  -> Queue + workers (feed ingest, enrichment, scheduled jobs)
  -> Connectors (OSINT, customer SIEM, CTI feeds, ticketing)
```

Suggested production stack:
- MariaDB on SkySQL with workspace-scoped queries, tenant ownership checks, and transactional writes.
- Redis or a durable queue for ingestion and scheduled jobs.
- Object storage for immutable evidence, exports and report artifacts.
- OpenTelemetry-compatible logs/metrics/traces with secrets and sensitive IOC values redacted where appropriate.
- Outbound connector allowlists, egress controls, request timeouts, payload limits and per-provider rate limits.

## Data model target

- `workspaces`, `users`, `memberships`, `roles`, `invitations`, `sessions`
- `assets`, `asset_domains`, `asset_services`, `certificates`, `authorizations`
- `indicators`, `indicator_observations`, `indicator_relationships`, `sources`, `feed_runs`
- `threat_actors`, `campaigns`, `techniques`, `actor_techniques`
- `alerts`, `cases`, `alert_events`, `assignments`, `sla_policies`
- `watchlists`, `watchlist_items`, `detection_rules`, `hunt_queries`, `hunt_runs`
- `integrations`, `webhook_endpoints`, `webhook_deliveries`, `api_keys`
- `audit_events`, `retention_policies`, `consent_and_authorization_records`

Every tenant-owned record must include `workspace_id`; enforce it in every query and mutation, not just in the UI.

## Delivery backlog

### P0 — Operational MVP
1. **IOC management**: bulk import, normalization, deduplication, provenance, confidence, tags, first/last seen, watchlists, CSV/JSON export.
2. **Alert operations**: severity, deduplication keys, acknowledge/investigate/resolve/false-positive states, assignment, SLA timestamps and audit.
3. **Dashboard**: asset/IOC/alert counts, severity distribution, recent activity, stale watchlists, trend panels.
4. **Identity and workspace**: owner/admin/analyst/viewer roles, invitation and verified work email, workspace isolation tests, session revocation and access review.
5. **API foundation**: versioned API, scoped API keys, rate limits, webhook signing, idempotency, audit trail.
6. **Data foundation**: MariaDB migrations, backup/restore test, retention and export/delete workflows.

Acceptance criteria:
- Cross-workspace reads/writes are denied by tests.
- Duplicate IOC ingestion updates provenance/last-seen without duplicate records.
- Every analyst state transition creates an audit event.
- Alert acknowledgement and resolution timestamps are recorded.
- Exports are scoped to the requesting workspace and role.

### P1 — Hunting and exposure
- Feed registry with connector health, licensing/terms metadata, ingest schedule, parsing, deduplication and quarantine.
- Search and pivot by IP/domain/URL/hash/email/certificate with relationship graph and timeline.
- MITRE ATT&CK catalog versioning, technique mapping and coverage view.
- Saved hunts, query history, analyst notes and evidence bundles.
- Authorized attack-surface discovery: passive DNS/CT, asset ownership, exposed service metadata and change detection.
- Detection rule lifecycle: Sigma/YARA storage, review, versioning and test fixtures. Rule execution only against authorized telemetry/samples.
- Notifications through email/Slack/Teams/webhook with delivery retry and dead-letter queue.

### P2 — Advanced response and intelligence
- Brand typo/lookalike detection using approved datasets, certificate transparency and registrar/provider abuse workflows.
- Credential exposure alerts sourced from licensed/authorized breach intelligence. Do not collect or store plaintext passwords; store minimal evidence and force resets through the identity provider.
- SOAR playbooks with dry-run, approval gates, scoped credentials, rollback and immutable action logs.
- STIX 2.1 export/import and TAXII client support with source attribution.
- Executive reporting, scheduled briefs, MTTD/MTTR and false-positive trend analysis.

## Dashboard information architecture

1. **Overview** — critical alerts, open cases, verified assets, new indicators, exposure trend, feed health.
2. **Threat Intel** — feed sources, recent reports, actors, campaigns, ATT&CK techniques.
3. **IOC Explorer** — search, bulk import, enrichment provenance, pivot graph, watchlists, export.
4. **Attack Surface** — authorized assets, subdomains, certificates, services, changes, remediation owner.
5. **Alerts & Cases** — queue, severity/SLA, assignment, timeline, evidence, resolution.
6. **Hunt Workbench** — hypothesis, query builder, data sources, saved hunts, results, notes.
7. **Detection Engineering** — Sigma/YARA rules, validation fixtures, review and release lifecycle.
8. **Brand & Exposure** — lookalike domains, phishing reports, takedown case tracking.
9. **Integrations** — feed connectors, SIEM/SOAR, webhooks, API keys and health.
10. **Workspace Admin** — members, roles, SSO, verification, retention, audit, authorized scope.

## Operating cadence

- Daily: alert triage, IOC enrichment, critical exposure review, feed health and watchlist review.
- Weekly: hunting hypotheses, detection tuning, false-positive review, threat brief and remediation follow-up.
- Monthly: access review, retention/compliance review, coverage gaps, MTTD/MTTR trends, integration/API health.

## Metrics

- MTTD = detection timestamp minus earliest known event timestamp.
- MTTR = resolved timestamp minus alert creation timestamp.
- Alert precision = true-positive alerts / all reviewed alerts.
- IOC enrichment coverage = indicators with source/provenance / indicators processed.
- Exposure remediation time = verified closure timestamp minus finding creation timestamp.
- Feed freshness = now minus most recent successful feed ingestion timestamp.

## Legal and operational controls

- Require customer authorization and scope before discovery or scanning.
- Keep dark-web/credential exposure work to licensed or otherwise lawful sources; do not attempt to log in with leaked credentials.
- Keep evidence provenance, collection timestamp, retention deadline and analyst access trail.
- Require dual control or explicit human approval for takedowns, blocks, credential resets and external response.
- Document false-positive handling and data-subject deletion/retention processes.
