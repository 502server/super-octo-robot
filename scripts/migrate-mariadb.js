import { pathToFileURL } from "node:url";
import { closeMariaDbPool, getMariaDbPool } from "../backend/database.js";
import { ensureMariaDbStateTable } from "../backend/mariadb-schema.js";

export async function migrateMariaDb() {
  const pool = getMariaDbPool();
  if (!pool) throw new Error("MARIADB_URL is required to migrate the MariaDB schema");
  try {
    await ensureMariaDbStateTable(pool);
    console.log("MariaDB app-state schema is ready.");
  } finally {
    await closeMariaDbPool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateMariaDb().catch((error) => {
    console.error("MariaDB migration failed:", error.message);
    process.exitCode = 1;
  });
}
