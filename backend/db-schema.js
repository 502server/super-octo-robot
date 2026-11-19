import {
  boolean,
  char,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = (name = "created_at") => timestamp(name, { withTimezone: true, mode: "date" });
const updatedAt = (name = "updated_at") => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash"),
  name: text("name"),
  email: text("email"),
  authUserId: text("auth_user_id"),
  oauthIdentityIds: text("oauth_identity_ids").array().notNull().default([]),
  createdAt: createdAt().notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt().notNull(),
});

export const workspaceMemberships = pgTable("workspace_memberships", {
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: createdAt().notNull(),
});

export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  role: text("role").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  createdAt: createdAt().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  origin: text("origin").notNull(),
  notes: text("notes").notNull(),
  verified: boolean("verified").notNull(),
  verificationChallengeHash: char("verification_challenge_hash", { length: 64 }),
  createdBy: uuid("created_by"),
  createdAt: createdAt().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
});

export const indicators = pgTable("indicators", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  type: text("type").notNull(),
  value: text("value").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  source: text("source").notNull(),
  confidence: smallint("confidence").notNull(),
  severity: text("severity").notNull(),
  tags: text("tags").array().notNull(),
  mitreTechniques: text("mitre_techniques").array().notNull(),
  sources: text("sources").array().notNull(),
  notes: text("notes").notNull(),
  status: text("status").notNull(),
  watchlisted: boolean("watchlisted").notNull(),
  firstSeen: timestamp("first_seen", { withTimezone: true, mode: "date" }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true, mode: "date" }).notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt().notNull(),
  updatedAt: updatedAt(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  indicatorId: uuid("indicator_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  assigneeUserId: uuid("assignee_user_id"),
  createdBy: uuid("created_by"),
  createdAt: createdAt().notNull(),
  updatedAt: updatedAt().notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, mode: "date" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  assetId: uuid("asset_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt().notNull(),
  updatedAt: updatedAt().notNull(),
});

export const assetChecks = pgTable("asset_checks", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  assetId: uuid("asset_id").notNull(),
  httpStatus: integer("http_status"),
  reachable: boolean("reachable").notNull(),
  https: boolean("https").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }).notNull(),
  error: text("error"),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const migrationImportBatches = pgTable("migration_import_batches", {
  sourceHash: char("source_hash", { length: 64 }).primaryKey(),
  importedAt: createdAt("imported_at").notNull(),
  rowCounts: jsonb("row_counts").notNull(),
});
