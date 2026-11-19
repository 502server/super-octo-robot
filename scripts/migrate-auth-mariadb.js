import { getAuthTables } from "better-auth/db";
import { pathToFileURL } from "node:url";
import { closeMariaDbPool, getMariaDbPool } from "../backend/database.js";
import { createMariaDbAuthTableStatements } from "../backend/mariadb-auth-schema.js";

export async function migrateAuthMariaDb() {
  const pool = getMariaDbPool();
  if (!pool) throw new Error("MARIADB_URL is required to migrate Better Auth tables");

  try {
    const statements = createMariaDbAuthTableStatements(getAuthTables({}));
    for (const statement of statements) await pool.query(statement);
    console.log("Better Auth MariaDB tables are ready.");
  } finally {
    await closeMariaDbPool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateAuthMariaDb().catch((error) => {
    console.error("Better Auth MariaDB migration failed:", error.message);
    process.exitCode = 1;
  });
}
