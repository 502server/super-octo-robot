import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { closeMariaDbPool, getMariaDbPool } from "./database.js";

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
let state = structuredClone(empty);
let chain = Promise.resolve();
let pool = null;
const requestState = new AsyncLocalStorage();

export function migrateState(target) {
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

export function normalizeState(input) {
  const target = {
    ...structuredClone(empty),
    ...(input && typeof input === "object" && !Array.isArray(input) ? structuredClone(input) : {}),
  };
  migrateState(target);
  return target;
}

function parsePayload(payload) {
  let value = payload;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("MariaDB app-state payload is invalid JSON");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MariaDB app-state payload must be a JSON object");
  }
  return normalizeState(value);
}

async function readMariaDbState(executor, lock = false) {
  const [rows] = await executor.query(
    `SELECT payload FROM fivezero2_app_state WHERE singleton = 1${lock ? " FOR UPDATE" : ""}`,
  );
  if (!rows.length) {
    throw new Error("MariaDB app-state row is missing. Run pnpm db:migrate:mariadb before starting the app.");
  }
  return parsePayload(rows[0].payload);
}

async function readFileState() {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    return normalizeState(JSON.parse(await fs.readFile(file, "utf8")));
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

export const assetVerificationChallenge = (assetId) =>
  crypto
    .createHmac("sha256", process.env.SESSION_SECRET || process.env.BETTER_AUTH_SECRET || "")
    .update("fivezero2.asset-verification:" + assetId)
    .digest("hex");

export async function loadStore() {
  pool = getMariaDbPool();
  if (pool) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      state = await readMariaDbState(connection, true);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    console.log("State store: MariaDB transactional JSON state");
    return;
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || process.env.V0_RUNTIME_URL) {
    throw new Error("MARIADB_URL is required for hosted deployments; local JSON storage is disabled there");
  }

  state = await readFileState();
  migrateState(state);
  await persistFile(state);
  console.log("State store: local JSON file");
}

export function read(fn) {
  const request = requestState.getStore();
  return fn(structuredClone(request?.state || state));
}

export async function refreshStore() {
  if (!pool) return structuredClone(state);
  state = await readMariaDbState(pool);
  return structuredClone(state);
}

export function withStoreState(snapshot, next) {
  requestState.run({ state: snapshot }, next);
}

export function write(fn) {
  const run = chain.then(async () => {
    if (pool) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const working = await readMariaDbState(connection, true);
        const output = await fn(working);
        migrateState(working);
        await connection.execute(
          "UPDATE fivezero2_app_state SET payload = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE singleton = 1",
          [JSON.stringify(working)],
        );
        await connection.commit();
        state = working;
        const request = requestState.getStore();
        if (request) request.state = structuredClone(working);
        return output;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }

    const working = structuredClone(state);
    const output = await fn(working);
    migrateState(working);
    await persistFile(working);
    state = working;
    const request = requestState.getStore();
    if (request) request.state = structuredClone(working);
    return output;
  });
  chain = run.catch(() => {});
  return run;
}

export async function closeStore() {
  pool = null;
  await closeMariaDbPool();
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
