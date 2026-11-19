import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as tables from "./db-schema.js";

const file = path.resolve(process.env.DATA_FILE || "./data/state.json");
const empty = {
  workspaces: [],
  invitations: [],
  users: [],
  sessions: [],
  assets: [],
  findings: [],
  checks: [],
  audit: [],
  iocs: [],
  alerts: [],
};
let state = structuredClone(empty), chain = Promise.resolve(), pool = null, database = null;
const requestState = new AsyncLocalStorage();

function migrateState(target) {
  let changed = false;
  for (const [key, value] of Object.entries(empty)) {
    if (!Array.isArray(target[key])) {
      target[key] = structuredClone(value);
      changed = true;
    }
  }
  if (target.users.length && !target.workspaces.length) {
    target.workspaces.push({
      id: "ws_default",
      name: "Default Workspace",
      slug: "default",
      createdAt: new Date().toISOString(),
      createdBy: target.users[0].id,
    });
    changed = true;
  }
  const workspaceId = target.workspaces[0]?.id || "ws_default";
  for (const user of target.users) {
    if (!user.workspaceId) {
      user.workspaceId = workspaceId;
      if (!user.role) user.role = "owner";
      changed = true;
    }
  }
  for (const key of ["assets", "findings", "checks", "iocs", "alerts", "invitations", "sessions"]) {
    for (const row of target[key]) {
      if (!row.workspaceId && key !== "invitations" && key !== "sessions") {
        row.workspaceId = workspaceId;
        changed = true;
      }
    }
  }
  for (const event of target.audit) {
    if (!event.workspaceId) {
      event.workspaceId = workspaceId;
      changed = true;
    }
  }
  return changed;
}

async function readFileState() {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    return { ...structuredClone(empty), ...JSON.parse(await fs.readFile(file, "utf8")) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return structuredClone(empty);
  }
}

async function persistFile(target) {
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(target, null, 2), { mode: 0o600 });
  await fs.rename(temporary, file);
}

const asDate = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid timestamp in application data");
  return date;
};
const asIso = (value) => value == null ? null : (value instanceof Date ? value : new Date(value)).toISOString();
const dateMap = (row, keys) => Object.fromEntries(keys.map((key) => [key, asIso(row[key])]));
const stable = (value) => JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item);
export const assetVerificationChallenge = (assetId) => crypto
  .createHmac("sha256", process.env.SESSION_SECRET || process.env.BETTER_AUTH_SECRET || "")
  .update("fivezero2.asset-verification:" + assetId)
  .digest("hex");
const challengeHash = (assetId) => crypto.createHash("sha256").update(assetVerificationChallenge(assetId)).digest("hex");

async function loadRelationalState(client = database) {
  const [workspaceRows, userRows, membershipRows, invitationRows, sessionRows, assetRows, findingRows, checkRows, auditRows, indicatorRows, alertRows] = await Promise.all([
    client.select().from(tables.workspaces),
    client.select().from(tables.users),
    client.select().from(tables.workspaceMemberships),
    client.select().from(tables.workspaceInvitations),
    client.select().from(tables.sessions),
    client.select().from(tables.assets),
    client.select().from(tables.findings),
    client.select().from(tables.assetChecks),
    client.select().from(tables.auditEvents),
    client.select().from(tables.indicators),
    client.select().from(tables.alerts),
  ]);
  const membershipByUser = new Map(membershipRows.map((row) => [row.userId, row]));
  const users = userRows.map((row) => {
    const membership = membershipByUser.get(row.id);
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      name: row.name,
      email: row.email,
      authUserId: row.authUserId,
      oauthIdentityIds: row.oauthIdentityIds || [],
      role: membership?.role || "viewer",
      workspaceId: membership?.workspaceId || null,
      createdAt: asIso(row.createdAt),
      disabledAt: asIso(row.disabledAt),
    };
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  return {
    workspaces: workspaceRows.map((row) => ({ ...row, createdAt: asIso(row.createdAt) })),
    users,
    invitations: invitationRows.map((row) => ({
      id: row.id, workspaceId: row.workspaceId, tokenHash: row.tokenHash, role: row.role,
      createdBy: row.createdBy, createdAt: asIso(row.createdAt), expiresAt: asDate(row.expiresAt).getTime(),
      usedAt: asIso(row.usedAt),
    })),
    sessions: sessionRows.filter((row) => !row.revokedAt).map((row) => ({
      id: row.id, userId: row.userId, workspaceId: row.workspaceId, hash: row.tokenHash,
      createdAt: asIso(row.createdAt), expiresAt: asDate(row.expiresAt).getTime(),
    })),
    assets: assetRows.map((row) => ({
      id: row.id, workspaceId: row.workspaceId, name: row.name, url: row.origin, notes: row.notes,
      verified: row.verified, challenge: assetVerificationChallenge(row.id), createdBy: row.createdBy,
      createdAt: asIso(row.createdAt), verifiedAt: asIso(row.verifiedAt),
    })),
    findings: findingRows.map((row) => ({ ...row, createdAt: asIso(row.createdAt), updatedAt: asIso(row.updatedAt) })),
    checks: checkRows.map((row) => ({
      id: row.id, workspaceId: row.workspaceId, assetId: row.assetId, status: row.httpStatus,
      ok: row.reachable, https: row.https, checkedAt: asIso(row.checkedAt), error: row.error,
    })),
    audit: auditRows.map((row) => ({
      id: row.id, workspaceId: row.workspaceId, userId: row.actorUserId, action: row.action,
      detail: row.detail, at: asIso(row.occurredAt),
    })),
    iocs: indicatorRows.map((row) => ({
      id: row.id, workspaceId: row.workspaceId, type: row.type, value: row.value, source: row.source,
      confidence: row.confidence, severity: row.severity, tags: row.tags || [], mitre: row.mitreTechniques || [],
      sources: row.sources || [], notes: row.notes, status: row.status, watchlisted: row.watchlisted,
      firstSeen: asIso(row.firstSeen), lastSeen: asIso(row.lastSeen), createdBy: row.createdBy,
      createdAt: asIso(row.createdAt), updatedAt: asIso(row.updatedAt),
    })),
    alerts: alertRows.map((row) => ({
      id: row.id, workspaceId: row.workspaceId, iocId: row.indicatorId, title: row.title,
      description: row.description, source: row.source, severity: row.severity, status: row.status,
      assignee: userById.get(row.assigneeUserId)?.username || null, createdBy: row.createdBy,
      createdAt: asIso(row.createdAt), updatedAt: asIso(row.updatedAt),
      acknowledgedAt: asIso(row.acknowledgedAt), resolvedAt: asIso(row.resolvedAt),
    })),
  };
}

function toRows(next, key) {
  if (key === "users") return next.users.map((row) => ({
    id: row.id, username: row.username, passwordHash: row.passwordHash || null, name: row.name || null,
    email: row.email || null, authUserId: row.authUserId || null,
    oauthIdentityIds: Array.isArray(row.oauthIdentityIds) ? row.oauthIdentityIds : [],
    createdAt: asDate(row.createdAt, new Date()), disabledAt: asDate(row.disabledAt),
  }));
  if (key === "workspaces") return next.workspaces.map((row) => ({
    id: row.id, slug: row.slug, name: row.name, createdBy: row.createdBy || null, createdAt: asDate(row.createdAt, new Date()),
  }));
  if (key === "workspaceMemberships") return next.users.filter((row) => row.workspaceId).map((row) => ({
    workspaceId: row.workspaceId, userId: row.id, role: row.role || "viewer", createdAt: asDate(row.createdAt, new Date()),
  }));
  if (key === "workspaceInvitations") return next.invitations.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, tokenHash: row.tokenHash, role: row.role,
    createdBy: row.createdBy || null, createdAt: asDate(row.createdAt, new Date()),
    expiresAt: asDate(row.expiresAt), usedAt: asDate(row.usedAt),
  }));
  if (key === "sessions") return next.sessions.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, userId: row.userId, tokenHash: row.hash,
    createdAt: asDate(row.createdAt, new Date()), expiresAt: asDate(row.expiresAt), revokedAt: null,
  }));
  if (key === "assets") return next.assets.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, name: row.name, origin: row.url, notes: row.notes || "",
    verified: Boolean(row.verified), verificationChallengeHash: challengeHash(row.id),
    createdBy: row.createdBy || null, createdAt: asDate(row.createdAt, new Date()), verifiedAt: asDate(row.verifiedAt),
  }));
  if (key === "indicators") return next.iocs.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, type: row.type, value: row.value,
    normalizedValue: String(row.value).trim().toLowerCase(), source: row.source || "manual",
    confidence: row.confidence ?? 50, severity: row.severity || "medium", tags: row.tags || [],
    mitreTechniques: row.mitre || [], sources: row.sources || [], notes: row.notes || "",
    status: row.status || "active", watchlisted: Boolean(row.watchlisted),
    firstSeen: asDate(row.firstSeen, asDate(row.createdAt, new Date())),
    lastSeen: asDate(row.lastSeen, asDate(row.createdAt, new Date())), createdBy: row.createdBy || null,
    createdAt: asDate(row.createdAt, new Date()), updatedAt: asDate(row.updatedAt),
  }));
  if (key === "alerts") return next.alerts.map((row) => {
    const assignee = next.users.find((user) => user.workspaceId === row.workspaceId && user.username?.toLowerCase() === String(row.assignee || "").toLowerCase());
    return {
      id: row.id, workspaceId: row.workspaceId, indicatorId: row.iocId || null, title: row.title,
      description: row.description || "", source: row.source || "manual", severity: row.severity || "medium",
      status: row.status || "open", assigneeUserId: assignee?.id || null, createdBy: row.createdBy || null,
      createdAt: asDate(row.createdAt, new Date()), updatedAt: asDate(row.updatedAt, asDate(row.createdAt, new Date())),
      acknowledgedAt: asDate(row.acknowledgedAt), resolvedAt: asDate(row.resolvedAt),
    };
  });
  if (key === "findings") return next.findings.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, assetId: row.assetId || null, title: row.title || row.name,
    description: row.description || "", severity: row.severity || "medium", status: row.status || "open",
    createdBy: row.createdBy || null, createdAt: asDate(row.createdAt, new Date()),
    updatedAt: asDate(row.updatedAt, asDate(row.createdAt, new Date())),
  }));
  if (key === "assetChecks") return next.checks.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, assetId: row.assetId, httpStatus: row.status ?? null,
    reachable: Boolean(row.ok), https: Boolean(row.https), checkedAt: asDate(row.checkedAt, new Date()), error: row.error || null,
  }));
  return next.audit.map((row) => ({
    id: row.id, workspaceId: row.workspaceId, actorUserId: row.userId || null,
    action: row.action, detail: row.detail || "", occurredAt: asDate(row.at, new Date()),
  }));
}

const collections = [
  { key: "users", table: tables.users, id: "id" },
  { key: "workspaces", table: tables.workspaces, id: "id" },
  { key: "workspaceMemberships", table: tables.workspaceMemberships, id: "userId", compound: true },
  { key: "workspaceInvitations", table: tables.workspaceInvitations, id: "id" },
  { key: "sessions", table: tables.sessions, id: "id" },
  { key: "assets", table: tables.assets, id: "id" },
  { key: "indicators", table: tables.indicators, id: "id", source: "iocs" },
  { key: "alerts", table: tables.alerts, id: "id" },
  { key: "findings", table: tables.findings, id: "id" },
  { key: "assetChecks", table: tables.assetChecks, id: "id", source: "checks" },
  { key: "auditEvents", table: tables.auditEvents, id: "id", source: "audit" },
];

async function persistChanges(tx, before, after) {
  const rowSets = new Map(collections.map((item) => [item.key, toRows(after, item.key === "workspaceMemberships" ? item.key : item.source || item.key)]));
  const oldRowSets = new Map(collections.map((item) => [item.key, toRows(before, item.key === "workspaceMemberships" ? item.key : item.source || item.key)]));
  const deletionOrder = ["sessions", "workspaceInvitations", "alerts", "assetChecks", "findings", "indicators", "assets", "workspaceMemberships", "auditEvents", "workspaces", "users"];
  for (const name of deletionOrder) {
    const item = collections.find((candidate) => candidate.key === name);
    const rows = rowSets.get(name), oldRows = oldRowSets.get(name);
    const rowKey = (row) => item.compound ? row.workspaceId + ":" + row.userId : row[item.id];
    const present = new Set(rows.map(rowKey));
    const removed = oldRows.filter((row) => !present.has(rowKey(row)));
    if (!removed.length) continue;
    if (item.compound) {
      for (const row of removed) await tx.delete(item.table).where(and(eq(item.table.workspaceId, row.workspaceId), eq(item.table.userId, row.userId)));
    } else {
      await tx.delete(item.table).where(inArray(item.table[item.id], removed.map((row) => row[item.id])));
    }
  }
  for (const item of collections) {
    const rows = rowSets.get(item.key), oldRows = oldRowSets.get(item.key);
    const rowKey = (row) => item.compound ? row.workspaceId + ":" + row.userId : row[item.id];
    const oldByKey = new Map(oldRows.map((row) => [rowKey(row), stable(row)]));
    for (const row of rows) {
      if (oldByKey.get(rowKey(row)) === stable(row)) continue;
      const target = item.compound ? [item.table.workspaceId, item.table.userId] : item.table[item.id];
      await tx.insert(item.table).values(row).onConflictDoUpdate({ target, set: row });
    }
  }
}

export async function loadStore() {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 5),
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
      application_name: "fivezero2-group",
    });
    pool.on("error", () => console.error("PostgreSQL idle connection error"));
    database = drizzle(pool, { schema: tables });
    const imported = await database.select({ sourceHash: tables.migrationImportBatches.sourceHash }).from(tables.migrationImportBatches).limit(1);
    const [workspace] = await database.select({ id: tables.workspaces.id }).from(tables.workspaces).limit(1);
    if (!workspace && !imported.length) {
      const legacy = await pool.query("SELECT payload FROM fivezero2_app_state WHERE singleton=true");
      const legacyState = legacy.rows[0]?.payload;
      const hasLegacyRecords = legacyState && Object.keys(empty).some((key) =>
        Array.isArray(legacyState[key]) && legacyState[key].length > 0,
      );
      if (hasLegacyRecords) throw new Error("Legacy JSONB data exists but has not been imported. Run the guarded relational cutover command before starting this app.");
    }
    state = await loadRelationalState();
    console.log("State store: Neon PostgreSQL relational tables");
    return;
  }
  state = await readFileState();
  if (migrateState(state) || !(await exists())) await persistFile(state);
  console.log("State store: local JSON file");
}

async function exists() {
  try { await fs.access(file); return true; } catch { return false; }
}

export function read(fn) {
  const request = requestState.getStore();
  return fn(structuredClone(request?.state || state));
}

export async function refreshStore() {
  if (!database) return structuredClone(state);
  state = await loadRelationalState();
  return structuredClone(state);
}

export function withStoreState(snapshot, next) {
  requestState.run({ state: snapshot }, next);
}

export function write(fn) {
  const run = chain.then(async () => {
    if (database) {
      return database.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(505052, 1)`);
        const before = await loadRelationalState(tx);
        const working = structuredClone(before);
        const output = await fn(working);
        migrateState(working);
        await persistChanges(tx, before, working);
        state = working;
        const request = requestState.getStore();
        if (request) request.state = structuredClone(working);
        return output;
      });
    }
    const working = structuredClone(state);
    const output = await fn(working);
    migrateState(working);
    await persistFile(working);
    state = working;
    return output;
  });
  chain = run.catch(() => {});
  return run;
}

export async function closeStore() {
  if (pool) {
    const current = pool;
    pool = null;
    database = null;
    await current.end();
  }
}
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
