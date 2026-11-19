const emptyState = {
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
  moduleRecords: [],
  executionLogs: [],
};

const emptyStateJson = JSON.stringify(emptyState);

export async function ensureMariaDbStateTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fivezero2_app_state (
      singleton TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.execute("INSERT IGNORE INTO fivezero2_app_state (singleton, payload) VALUES (1, ?)", [
    emptyStateJson,
  ]);
}

export function isEmptyAppState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const known = Object.keys(emptyState);
  const optionalLegacyKeys = new Set(["moduleRecords", "executionLogs"]);
  return (
    Object.keys(value).every((key) => known.includes(key)) &&
    known.every(
      (key) =>
        (optionalLegacyKeys.has(key) && value[key] === undefined) ||
        (Array.isArray(value[key]) && value[key].length === 0),
    )
  );
}
