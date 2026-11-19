import test from "node:test";
import assert from "node:assert/strict";
import { buildAssistantContext } from "./assistant.js";

const state = {
  iocs: [
    { id: "ioc-a", workspaceId: "workspace-a", type: "domain", value: "owned.example", confidence: 90, status: "active" },
    { id: "ioc-b", workspaceId: "workspace-b", type: "domain", value: "other.example", confidence: 80, status: "active" },
  ],
  alerts: [
    { id: "alert-a", workspaceId: "workspace-a", title: "Suspicious sign-in", severity: "high", status: "open" },
    { id: "alert-b", workspaceId: "workspace-b", title: "Other workspace alert", severity: "critical", status: "open" },
  ],
  assets: [{ id: "asset-a", workspaceId: "workspace-a", name: "Owned asset", url: "https://owned.example", verified: true }],
  findings: [{ id: "finding-a", workspaceId: "workspace-a", title: "TLS review", severity: "medium", status: "open" }],
  moduleRecords: [
    { id: "cloud-a", workspaceId: "workspace-a", module: "cloud", title: "Public storage review", severity: "high", status: "open" },
    { id: "cloud-b", workspaceId: "workspace-b", module: "cloud", title: "Other workspace record", severity: "critical", status: "open" },
  ],
};

test("assistant context includes only records from the authenticated workspace", () => {
  const context = buildAssistantContext(state, "workspace-a", "iocs");

  assert.equal(context.summary.indicators, 1);
  assert.equal(context.summary.openAlerts, 1);
  assert.equal(context.currentMenuRecords.length, 1);
  assert.equal(context.currentMenuRecords[0].value, "owned.example");
  assert.equal(JSON.stringify(context).includes("other.example"), false);
  assert.equal(JSON.stringify(context).includes("Other workspace alert"), false);
});

test("assistant context maps cloud exposure to the current module records", () => {
  const context = buildAssistantContext(state, "workspace-a", "cloud");

  assert.equal(context.currentMenu, "Cloud exposure");
  assert.equal(context.currentMenuRecords.length, 1);
  assert.equal(context.currentMenuRecords[0].title, "Public storage review");
});
