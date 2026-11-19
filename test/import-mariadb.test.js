import test from "node:test";
import assert from "node:assert/strict";
import { buildImportPlan, databaseUrlFor } from "../scripts/import-json-to-mariadb.js";

const sampleState = () => ({
  workspaces: [{ id: "ws_default", name: "Default", slug: "default", createdBy: "u1" }],
  users: [
    { id: "u1", username: "owner", passwordHash: "$2b$example", workspaceId: "ws_default", role: "owner" },
  ],
  invitations: [],
  sessions: [
    { id: "s1", userId: "u1", workspaceId: "ws_default", hash: "a".repeat(64), expiresAt: 9999999999999 },
  ],
  assets: [
    { id: "a1", workspaceId: "ws_default", name: "Example", url: "https://example.com", verified: false },
  ],
  findings: [],
  checks: [],
  audit: [],
  iocs: [{ id: "i1", workspaceId: "ws_default", type: "domain", value: "example.com" }],
  alerts: [
    {
      id: "al1",
      workspaceId: "ws_default",
      title: "IOC alert",
      severity: "high",
      status: "open",
      iocId: "i1",
    },
  ],
});

test("uses Legacy PostgreSQL only as source and MariaDB only as target", () => {
  assert.equal(
    databaseUrlFor({ fromDatabase: true, env: { LEGACY_POSTGRES_URL: "source", MARIADB_URL: "target" } }),
    "source",
  );
  assert.equal(databaseUrlFor({ fromDatabase: true, env: { MARIADB_URL: "target" } }), undefined);
  assert.equal(
    databaseUrlFor({ fromDatabase: false, env: { LEGACY_POSTGRES_URL: "source", MARIADB_URL: "target" } }),
    "target",
  );
});

test("builds a validated import plan preserving IDs and hashed credentials", () => {
  const plan = buildImportPlan(sampleState(), "a".repeat(64));
  assert.equal(plan.ok, true);
  assert.equal(plan.sourceHash, "a".repeat(64));
  assert.equal(plan.counts.users, 1);
  assert.equal(plan.counts.sessions, 1);
  assert.equal(plan.state.users[0].id, "u1");
  assert.equal(plan.state.sessions[0].hash, "a".repeat(64));
  assert.ok(plan.securityPolicy.includes("raw session tokens are never exported"));
});

test("rejects orphaned tenant and indicator references before connecting", () => {
  const state = sampleState();
  state.alerts[0].iocId = "missing";
  const plan = buildImportPlan(state, "b".repeat(64));
  assert.equal(plan.ok, false);
  assert.ok(plan.issues.some((issue) => issue.code === "IOC_NOT_FOUND"));
});
