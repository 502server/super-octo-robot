import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { closeMariaDbPool, getMariaDbPool } from "../api/database.js";
import { isEmptyAppState, ensureMariaDbStateTable } from "../api/mariadb-schema.js";
import { normalizeState } from "../api/store.js";
import { inspectState } from "./preflight-json-import.js";

const sourceHash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function databaseUrlFor({ fromDatabase, env = process.env }) {
  return fromDatabase ? env.FLY_DATABASE_URL : env.MARIADB_URL;
}

export function buildImportPlan(input, hash) {
  const validation = inspectState(input);
  if (!validation.ok) return { ok: false, issues: validation.issues, counts: validation.counts };
  const normalizedState = normalizeState(input);
  const counts = Object.fromEntries(
    Object.entries(validation.counts).map(([collection, value]) => [collection, value.accepted]),
  );
  return {
    ok: true,
    sourceHash: hash,
    state: normalizedState,
    counts,
    warnings: validation.issues.filter((issue) => issue.code === "ID_WILL_BE_REMAPPED"),
    securityPolicy:
      "Application data is copied as JSON; existing password and session token hashes are preserved, and raw session tokens are never exported.",
  };
}

async function readPostgresSource() {
  if (!process.env.FLY_DATABASE_URL) throw new Error("FLY_DATABASE_URL is required with --from-database");
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.FLY_DATABASE_URL,
    ssl:
      process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined,
    max: 1,
  });
  try {
    const result = await pool.query("SELECT payload FROM fivezero2_app_state WHERE singleton = true");
    if (!result.rowCount) throw new Error("The PostgreSQL source state row was not found");
    const payload = result.rows[0].payload;
    return {
      state: typeof payload === "string" ? JSON.parse(payload) : payload,
      source: "Fly PostgreSQL app-state row",
    };
  } finally {
    await pool.end();
  }
}

async function readFileSource(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return { state: JSON.parse(content), source: filePath, raw: content };
}

async function applyImport(plan) {
  const pool = getMariaDbPool();
  if (!pool) throw new Error("MARIADB_URL is required to apply the import");
  await ensureMariaDbStateTable(pool);
  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('fivezero2_mariadb_import', 15) AS acquired");
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error("Could not acquire the MariaDB import lock");
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT payload FROM fivezero2_app_state WHERE singleton = 1 FOR UPDATE",
    );
    if (!rows.length) throw new Error("The MariaDB app-state row is missing after schema migration");
    let existing = rows[0].payload;
    if (Buffer.isBuffer(existing)) existing = existing.toString("utf8");
    if (typeof existing === "string") existing = JSON.parse(existing);
    if (!isEmptyAppState(existing)) {
      throw new Error("MariaDB already contains application data; refusing to overwrite or merge it");
    }
    await connection.execute(
      "UPDATE fivezero2_app_state SET payload = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE singleton = 1",
      [JSON.stringify(plan.state)],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('fivezero2_mariadb_import')");
    connection.release();
    await closeMariaDbPool();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const backupConfirmed = args.includes("--backup-confirmed");
  const fromDatabase = args.includes("--from-database");
  if (apply && !backupConfirmed) {
    throw new Error("Refusing --apply without --backup-confirmed after a verified source backup");
  }

  let source;
  if (fromDatabase) {
    source = await readPostgresSource();
  } else {
    const filePath = path.resolve(
      args.find((value) => !value.startsWith("--")) || process.env.DATA_FILE || "./data/state.json",
    );
    source = await readFileSource(filePath);
  }

  const raw = source.raw || JSON.stringify(source.state);
  const hash = sourceHash(raw);
  const plan = buildImportPlan(source.state, hash);
  if (!plan.ok) {
    console.log(
      JSON.stringify({ ok: false, source: source.source, counts: plan.counts, issues: plan.issues }, null, 2),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        source: source.source,
        target: "MariaDB fivezero2_app_state",
        counts: plan.counts,
        sourceHash: plan.sourceHash,
        warnings: plan.warnings,
        securityPolicy: plan.securityPolicy,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. No MariaDB writes were performed.");
    return;
  }

  await applyImport(plan);
  console.log("Import committed to MariaDB in one transaction. The PostgreSQL source was not modified.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("Import failed; no partial target write was committed:", error.message);
    process.exitCode = 1;
  });
}
