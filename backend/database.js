import { createPool } from "mysql2/promise";

let pool;

export function mariaDbOptionsFromUrl(value = process.env.MARIADB_URL, env = process.env) {
  if (!value) throw new Error("MARIADB_URL is required");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MARIADB_URL must be a valid MariaDB connection URL");
  }

  if (!["mysql:", "mariadb:"].includes(url.protocol)) {
    throw new Error("MARIADB_URL must use the mysql:// or mariadb:// protocol");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!url.hostname || !url.username || !database) {
    throw new Error("MARIADB_URL must include a host, username, and database name");
  }

  const ca = env.MARIADB_SSL_CA?.replaceAll("\\n", "\n").trim();
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    timezone: "Z",
    waitForConnections: true,
    connectionLimit: Math.max(1, Math.min(Number(env.MARIADB_POOL_MAX || 5), 10)),
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    ssl: {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    },
  };
}

export function getMariaDbPool() {
  if (!pool && process.env.MARIADB_URL) {
    pool = createPool(mariaDbOptionsFromUrl());
    pool.on("error", () => console.error("MariaDB idle connection error"));
  }
  return pool || null;
}

export async function closeMariaDbPool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
