-- Fivezero2.group — initial PostgreSQL schema
-- Apply only after taking a backup and reviewing the target Hasura project.
-- This migration defines the relational target; the current Express app still uses JSON storage.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username));

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','analyst','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx ON workspace_memberships(user_id);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin','analyst','viewer')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS workspace_invitations_pending_idx
  ON workspace_invitations(workspace_id, expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_expiry_idx ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  origin text NOT NULL,
  notes text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT false,
  verification_challenge_hash char(64),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, origin)
);
CREATE INDEX IF NOT EXISTS assets_workspace_created_idx ON assets(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ip','domain','url','hash','email','cert')),
  value text NOT NULL,
  normalized_value text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  confidence smallint NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  tags text[] NOT NULL DEFAULT '{}',
  mitre_techniques text[] NOT NULL DEFAULT '{}',
  sources text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','review','closed')),
  watchlisted boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, type, normalized_value)
);
CREATE INDEX IF NOT EXISTS indicators_workspace_last_seen_idx ON indicators(workspace_id, last_seen DESC);
CREATE INDEX IF NOT EXISTS indicators_watchlist_idx ON indicators(workspace_id, watchlisted) WHERE watchlisted = true;
CREATE INDEX IF NOT EXISTS indicators_tags_gin_idx ON indicators USING gin(tags);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  indicator_id uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','investigating','resolved','false_positive')),
  assignee_user_id uuid,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  FOREIGN KEY (workspace_id, indicator_id)
    REFERENCES indicators(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, assignee_user_id)
    REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS alerts_queue_idx ON alerts(workspace_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_assignee_idx ON alerts(workspace_id, assignee_user_id, status);

CREATE TABLE IF NOT EXISTS findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_id uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','fixed','false_positive')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, asset_id)
    REFERENCES assets(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS findings_workspace_status_idx ON findings(workspace_id, status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS asset_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  http_status integer,
  reachable boolean NOT NULL DEFAULT false,
  https boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  error text,
  FOREIGN KEY (workspace_id, asset_id)
    REFERENCES assets(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS asset_checks_recent_idx ON asset_checks(workspace_id, asset_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_workspace_time_idx ON audit_events(workspace_id, occurred_at DESC);

COMMENT ON TABLE workspace_memberships IS 'Tenant membership and role source of truth. Configure Hasura row permissions using workspace_id and X-Hasura-Workspace-Id.';
COMMENT ON TABLE indicators IS 'Normalized IOC records. Preserve source provenance; confidence is analyst/feed supplied, not an automatic reputation score.';
COMMENT ON TABLE audit_events IS 'Append-only application audit trail. Restrict update/delete permissions for all application roles.';
