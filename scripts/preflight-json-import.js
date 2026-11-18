import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UUID_NS = "5f7d8e1a-6a9b-4b7c-9c2d-8e8f5b9d3a10";
const collections = ["workspaces","users","invitations","sessions","assets","findings","checks","audit","iocs","alerts"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function deterministicUuid(kind, value) {
  const digest = crypto.createHash("sha256").update(UUID_NS + ":" + kind + ":" + String(value)).digest("hex");
  const hex = digest.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const s = hex.join("");
  return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20);
}

export function inspectState(input) {
  const issues = [];
  const counts = {};
  const maps = {};
  for (const key of collections) {
    const rows = input?.[key] ?? [];
    if (!Array.isArray(rows)) {
      issues.push({collection:key, code:"NOT_ARRAY"});
      counts[key] = {source:0, accepted:0, rejected:1};
      maps[key] = new Map();
      continue;
    }
    counts[key] = {source:rows.length, accepted:0, rejected:0};
    const map = new Map();
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.id) {
        counts[key].rejected++;
        issues.push({collection:key, code:"MISSING_ID"});
        continue;
      }
      if (map.has(String(row.id))) {
        counts[key].rejected++;
        issues.push({collection:key, code:"DUPLICATE_ID", rowId:String(row.id)});
        continue;
      }
      map.set(String(row.id), deterministicUuid(key, row.id));
      counts[key].accepted++;
      if (!uuidPattern.test(String(row.id)) && !(key==="workspaces" && row.id==="ws_default")) {
        issues.push({collection:key, code:"ID_WILL_BE_REMAPPED", rowId:String(row.id)});
      }
    }
    maps[key] = map;
  }
  const rows = key => Array.isArray(input?.[key]) ? input[key] : [];
  const workspaceIds = new Set(rows("workspaces").map(x=>String(x.id)));
  const userIds = new Set(rows("users").map(x=>String(x.id)));
  const assetIds = new Set(rows("assets").map(x=>String(x.id)));
  const iocIds = new Set(rows("iocs").map(x=>String(x.id)));
  const membership = new Set((input.users||[]).map(x=>String(x.workspaceId||"")));
  const checkRef = (collection, rows, predicate, code) => {
    for (const row of rows||[]) if (!predicate(row)) issues.push({collection,code,rowId:String(row.id||"unknown")});
  };
  checkRef("users",input.users,x=>workspaceIds.has(String(x.workspaceId||"")),"WORKSPACE_NOT_FOUND");
  for (const key of ["assets","findings","checks","iocs","alerts","audit"]) {
    checkRef(key,input[key],x=>workspaceIds.has(String(x.workspaceId||"")),"WORKSPACE_NOT_FOUND");
  }
  checkRef("sessions",input.sessions,x=>userIds.has(String(x.userId||"")),"USER_NOT_FOUND");
  checkRef("invitations",input.invitations,x=>workspaceIds.has(String(x.workspaceId||"")),"WORKSPACE_NOT_FOUND");
  checkRef("checks",input.checks,x=>assetIds.has(String(x.assetId||"")),"ASSET_NOT_FOUND");
  checkRef("findings",input.findings,x=>!x.assetId||assetIds.has(String(x.assetId)),"ASSET_NOT_FOUND");
  checkRef("alerts",input.alerts,x=>!x.iocId||iocIds.has(String(x.iocId)),"IOC_NOT_FOUND");
  checkRef("alerts",input.alerts,x=>!x.assignee||rows("users").some(u=>u.username?.toLowerCase()===String(x.assignee).toLowerCase()&&u.workspaceId===x.workspaceId),"ASSIGNEE_NOT_FOUND_OR_CROSS_WORKSPACE");
  checkRef("audit",input.audit,x=>!x.userId||userIds.has(String(x.userId)),"USER_NOT_FOUND");
  checkRef("assets",input.assets,x=>typeof x.url==="string"&&x.url.length>0,"ASSET_ORIGIN_MISSING");
  checkRef("users",input.users,x=>typeof x.username==="string"&&x.username.length>0&&typeof x.passwordHash==="string","USER_CREDENTIAL_FIELDS_INVALID");
  checkRef("iocs",input.iocs,x=>typeof x.type==="string"&&typeof x.value==="string","IOC_FIELDS_INVALID");
  checkRef("alerts",input.alerts,x=>typeof x.title==="string"&&typeof x.severity==="string","ALERT_FIELDS_INVALID");
  const blocking = issues.filter(x=>!["ID_WILL_BE_REMAPPED"].includes(x.code));
  return {
    ok:blocking.length===0,
    counts,
    remappedIds:Object.fromEntries(Object.entries(maps).map(([k,m])=>[k,[...m.entries()].filter(([old])=>!uuidPattern.test(old)).map(([old,id])=>({old,id}))])),
    issues,
    note:"Preflight only. No database connection or writes are performed."
  };
}

async function main() {
  if (process.argv.includes("--apply")) {
    console.error("Refusing --apply: database importer/repository adapter is not implemented. This command is preflight-only.");
    process.exitCode=2;
    return;
  }
  const file=path.resolve(process.argv[2]||process.env.DATA_FILE||"./data/state.json");
  const state=JSON.parse(await fs.readFile(file,"utf8"));
  const report=inspectState(state);
  console.log(JSON.stringify({file, ...report},null,2));
  if (!report.ok) process.exitCode=1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e=>{console.error("Preflight failed:",e.message);process.exitCode=1});
