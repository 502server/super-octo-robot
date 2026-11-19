import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {inspectState,deterministicUuid} from "./preflight-json-import.js";

const keys=["workspaces","users","invitations","sessions","assets","findings","checks","audit","iocs","alerts"];
const iso=(v,fallback=null)=>{if(v===undefined||v===null||v==="")return fallback;const d=typeof v==="number"?new Date(v):new Date(v);if(Number.isNaN(d.getTime()))throw Error("Invalid timestamp in source data");return d.toISOString()};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idMap=(state,key)=>new Map((state[key]||[]).map(r=>[String(r.id),uuidPattern.test(String(r.id))?String(r.id):deterministicUuid(key,r.id)]));
const mapped=(map,value)=>value==null?null:map.get(String(value))||null;
const hash=v=>crypto.createHash("sha256").update(String(v)).digest("hex");
const safeText=(v,max=4000)=>String(v??"").slice(0,max);
const importTime=new Date().toISOString();

export function buildImportPlan(state,sourceHash) {
 const check=inspectState(state);
 if(!check.ok) return {ok:false,issues:check.issues,counts:check.counts};
 const ids=Object.fromEntries(keys.map(k=>[k,idMap(state,k)]));
 const workspaces=(state.workspaces||[]).map(w=>({id:ids.workspaces.get(String(w.id)),slug:safeText(w.slug||("workspace-"+ids.workspaces.get(String(w.id)).slice(0,8)),80),name:safeText(w.name||w.slug||"Workspace",160),created_by:mapped(ids.users,w.createdBy),created_at:iso(w.createdAt,importTime)}));
 const users=(state.users||[]).map(u=>({id:ids.users.get(String(u.id)),username:safeText(u.username,48),password_hash:u.passwordHash,created_at:iso(u.createdAt,importTime),disabled_at:iso(u.disabledAt)}));
 const memberships=(state.users||[]).map(u=>({workspace_id:mapped(ids.workspaces,u.workspaceId),user_id:ids.users.get(String(u.id)),role:u.role||"viewer"}));
 const invitations=(state.invitations||[]).map(x=>({id:ids.invitations.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),token_hash:x.tokenHash,role:x.role,created_by:mapped(ids.users,x.createdBy),created_at:iso(x.createdAt,importTime),expires_at:iso(x.expiresAt),used_at:iso(x.usedAt)}));
 const assets=(state.assets||[]).map(x=>({id:ids.assets.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),name:safeText(x.name||new URL(x.url).hostname,160),origin:x.url,notes:safeText(x.notes,2000),verified:Boolean(x.verified),verification_challenge_hash:x.challenge?hash(x.challenge):null,created_by:mapped(ids.users,x.createdBy),created_at:iso(x.createdAt,importTime),verified_at:iso(x.verifiedAt)}));
 const indicators=(state.iocs||[]).map(x=>({id:ids.iocs.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),type:x.type,value:x.value,normalized_value:String(x.value).trim().toLowerCase(),source:safeText(x.source||"manual",120),confidence:Number.isInteger(x.confidence)?x.confidence:50,severity:x.severity||"medium",tags:Array.isArray(x.tags)?x.tags:[],mitre_techniques:Array.isArray(x.mitre)?x.mitre:[],sources:Array.isArray(x.sources)?x.sources:[],notes:safeText(x.notes,1000),status:x.status||"active",watchlisted:Boolean(x.watchlisted),first_seen:iso(x.firstSeen,iso(x.createdAt,importTime)),last_seen:iso(x.lastSeen,iso(x.createdAt,importTime)),created_by:mapped(ids.users,x.createdBy),created_at:iso(x.createdAt,importTime),updated_at:iso(x.updatedAt)}));
 const findings=(state.findings||[]).map(x=>({id:ids.findings.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),asset_id:mapped(ids.assets,x.assetId),title:safeText(x.title||x.name,180),description:safeText(x.description,4000),severity:x.severity||"medium",status:x.status||"open",created_by:mapped(ids.users,x.createdBy),created_at:iso(x.createdAt),updated_at:iso(x.updatedAt)}));
 const checks=(state.checks||[]).map(x=>({id:ids.checks.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),asset_id:mapped(ids.assets,x.assetId),http_status:x.status??null,reachable:Boolean(x.ok),https:Boolean(x.https),checked_at:iso(x.checkedAt,importTime),error:safeText(x.error,1000)||null}));
 const alerts=(state.alerts||[]).map(x=>{const assignee=(state.users||[]).find(u=>u.workspaceId===x.workspaceId&&u.username?.toLowerCase()===String(x.assignee||"").toLowerCase());return {id:ids.alerts.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),indicator_id:mapped(ids.iocs,x.iocId),title:safeText(x.title,180),description:safeText(x.description,2000),source:safeText(x.source||"manual",120),severity:x.severity||"medium",status:x.status||"open",assignee_user_id:assignee?ids.users.get(String(assignee.id)):null,created_by:mapped(ids.users,x.createdBy),created_at:iso(x.createdAt,importTime),updated_at:iso(x.updatedAt,importTime),acknowledged_at:iso(x.acknowledgedAt),resolved_at:iso(x.resolvedAt)}});
 const audit=(state.audit||[]).map(x=>({id:ids.audit.get(String(x.id)),workspace_id:mapped(ids.workspaces,x.workspaceId),actor_user_id:mapped(ids.users,x.userId),action:safeText(x.action,160),detail:safeText(x.detail,4000),occurred_at:iso(x.at,importTime)}));
 const tables={users,workspaces,workspace_memberships:memberships,workspace_invitations:invitations,assets,indicators,findings,asset_checks:checks,alerts,audit_events:audit};
 for(const [table,rows] of Object.entries(tables)) for(const row of rows) {
   for(const [k,v] of Object.entries(row)) if(k.endsWith("_hash")&&v!=null&&typeof v!=="string") return {ok:false,issues:[{collection:table,code:"INVALID_HASH_FIELD"}]};
   if(table==="findings"&&!row.title) return {ok:false,issues:[{collection:table,code:"FINDING_TITLE_MISSING",rowId:row.id}]};
 }
 const enumChecks=[...(state.users||[]).map(x=>["users",x.id,["owner","admin","analyst","viewer"].includes(x.role||"viewer")]),...(state.invitations||[]).map(x=>["workspace_invitations",x.id,["admin","analyst","viewer"].includes(x.role)]),...(state.iocs||[]).map(x=>["iocs",x.id,["ip","domain","url","hash","email","cert"].includes(x.type)&&["low","medium","high","critical"].includes(x.severity||"medium")&&["active","review","closed"].includes(x.status||"active")]),...(state.alerts||[]).map(x=>["alerts",x.id,["low","medium","high","critical"].includes(x.severity||"medium")&&["open","acknowledged","investigating","resolved","false_positive"].includes(x.status||"open")]),...(state.findings||[]).map(x=>["findings",x.id,["low","medium","high","critical"].includes(x.severity||"medium")&&["open","accepted","fixed","false_positive"].includes(x.status||"open")])];
 for(const [collection,rowId,valid] of enumChecks)if(!valid)return {ok:false,issues:[{collection,code:"ENUM_VALUE_INVALID",rowId:String(rowId)}]};
 const uniqueness=[["users",(state.users||[]).map(x=>String(x.username||"").toLowerCase())],["workspaces",(state.workspaces||[]).map(x=>String(x.slug||"").toLowerCase())],["indicators",(state.iocs||[]).map(x=>String(x.workspaceId)+"|"+x.type+"|"+String(x.value).trim().toLowerCase())]];
 for(const [collection,values] of uniqueness)if(new Set(values).size!==values.length)return {ok:false,issues:[{collection,code:"UNIQUE_CONSTRAINT_COLLISION"}]};
 const counts=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]));
 return {ok:true,sourceHash,tables,counts,sessionPolicy:"Existing sessions are intentionally not imported; all users must sign in again after cutover.",securityPolicy:"Asset challenges are SHA-256 hashed; users must re-verify DNS after cutover if the runtime still expects plaintext challenges."};
}

async function insertRows(client,table,rows) {
 if(!rows.length)return;
 const cols=Object.keys(rows[0]);
 for(const row of rows) {
   const values=cols.map(k=>row[k]);
   const slots=cols.map((_,i)=>"$"+(i+1)).join(",");
   await client.query("INSERT INTO "+table+" ("+cols.join(",")+") VALUES ("+slots+")",values);
 }
}
async function main(){
 const args=process.argv.slice(2),apply=args.includes("--apply"),backup=args.includes("--backup-confirmed");
 if(apply&&!backup){console.error("Refusing apply without --backup-confirmed.");process.exitCode=2;return}
 if(apply&&!process.env.DATABASE_URL){console.error("DATABASE_URL is required for --apply.");process.exitCode=2;return}
 const file=path.resolve(args.find(x=>!x.startsWith("--"))||process.env.DATA_FILE||"./data/state.json");
 const raw=await fs.readFile(file,"utf8"),state=JSON.parse(raw),sourceHash=hash(raw);
 const plan=buildImportPlan(state,sourceHash);
 if(!plan.ok){console.log(JSON.stringify({ok:false,counts:plan.counts,issues:plan.issues},null,2));process.exitCode=1;return}
 console.log(JSON.stringify({mode:apply?"apply":"dry-run",file,counts:plan.counts,sourceHash,sessionPolicy:plan.sessionPolicy,securityPolicy:plan.securityPolicy},null,2));
 if(!apply){console.log("Dry-run only. No database connection or writes were performed.");return}
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==="require"?{rejectUnauthorized:process.env.PGSSL_REJECT_UNAUTHORIZED!=="false"}:undefined,max:1});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("CREATE TABLE IF NOT EXISTS migration_import_batches (source_hash char(64) PRIMARY KEY, imported_at timestamptz NOT NULL DEFAULT now(), row_counts jsonb NOT NULL)");
  const prior=await client.query("SELECT 1 FROM migration_import_batches WHERE source_hash=$1",[sourceHash]);
  if(prior.rowCount)throw Error("This exact JSON snapshot was already imported.");
  const order=["users","workspaces","workspace_memberships","workspace_invitations","assets","indicators","findings","asset_checks","alerts","audit_events"];
  for(const table of order)await insertRows(client,table,plan.tables[table]);
  await client.query("INSERT INTO migration_import_batches(source_hash,row_counts) VALUES($1,$2::jsonb)",[sourceHash,JSON.stringify(plan.counts)]);
  await client.query("COMMIT");
  console.log("Import transaction committed. Verify counts and workspace isolation before cutover.");
 }catch(e){await client.query("ROLLBACK");throw e}
 finally{client.release();await pool.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error("Import failed; transaction rolled back:",e.message);process.exitCode=1});
