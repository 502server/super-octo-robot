import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {Pool} from "pg";

const file=path.resolve(process.env.DATA_FILE||"./data/state.json");
const empty={workspaces:[],invitations:[],users:[],sessions:[],assets:[],findings:[],checks:[],audit:[],iocs:[],alerts:[]};
let state=structuredClone(empty),chain=Promise.resolve(),pool=null;

function migrateState(target){
 let changed=false;
 for(const [k,v] of Object.entries(empty)){if(!Array.isArray(target[k])){target[k]=structuredClone(v);changed=true}}
 if(target.users.length&&!target.workspaces.length){
  target.workspaces.push({id:"ws_default",name:"Default Workspace",slug:"default",createdAt:new Date().toISOString(),createdBy:target.users[0].id});
  changed=true;
 }
 const workspaceId=target.workspaces[0]?.id||"ws_default";
 for(const user of target.users){if(!user.workspaceId){user.workspaceId=workspaceId;if(!user.role)user.role="owner";changed=true}}
 for(const key of ["assets","findings","checks","iocs","alerts"]){
  for(const row of target[key])if(!row.workspaceId){row.workspaceId=workspaceId;changed=true}
 }
 for(const event of target.audit)if(!event.workspaceId){event.workspaceId=workspaceId;changed=true}
 return changed;
}
async function readFileState(){
 await fs.mkdir(path.dirname(file),{recursive:true});
 try{return {...structuredClone(empty),...JSON.parse(await fs.readFile(file,"utf8"))}}
 catch(e){if(e.code!=="ENOENT")throw e;return structuredClone(empty)}
}
async function persistFile(target){
 const tmp=file+".tmp";
 await fs.writeFile(tmp,JSON.stringify(target,null,2),{mode:0o600});
 await fs.rename(tmp,file);
}
export async function loadStore(){
 if(process.env.DATABASE_URL){
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.PG_POOL_MAX||3),ssl:{rejectUnauthorized:true},application_name:"fivezero2-group"});
  pool.on("error",()=>console.error("PostgreSQL idle connection error"));
  await pool.query(`CREATE TABLE IF NOT EXISTS fivezero2_app_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    payload jsonb NOT NULL,
    revision bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const current=await client.query("SELECT payload FROM fivezero2_app_state WHERE singleton=true FOR UPDATE");
   if(!current.rowCount){
    const initial=await readFileState();
    migrateState(initial);
    await client.query("INSERT INTO fivezero2_app_state(singleton,payload) VALUES(true,$1::jsonb) ON CONFLICT(singleton) DO NOTHING",[JSON.stringify(initial)]);
   }
   const loaded=await client.query("SELECT payload FROM fivezero2_app_state WHERE singleton=true");
   state={...structuredClone(empty),...loaded.rows[0].payload};
   if(migrateState(state))await client.query("UPDATE fivezero2_app_state SET payload=$1::jsonb,revision=revision+1,updated_at=now() WHERE singleton=true",[JSON.stringify(state)]);
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}
  finally{client.release()}
  console.log("State store: PostgreSQL");
  return;
 }
 state=await readFileState();
 if(migrateState(state)||!(await exists()))await persistFile(state);
 console.log("State store: local JSON file");
}
async function exists(){try{await fs.access(file);return true}catch{return false}}
export function read(fn){return fn(structuredClone(state))}
export function write(fn){
 const run=chain.then(async()=>{
  if(pool){
   const client=await pool.connect();
   try{
    await client.query("BEGIN");
    const current=await client.query("SELECT payload FROM fivezero2_app_state WHERE singleton=true FOR UPDATE");
    if(!current.rowCount)throw Error("PostgreSQL application state row is missing");
    const working={...structuredClone(empty),...current.rows[0].payload};
    const out=await fn(working);
    await client.query("UPDATE fivezero2_app_state SET payload=$1::jsonb,revision=revision+1,updated_at=now() WHERE singleton=true",[JSON.stringify(working)]);
    await client.query("COMMIT");
    state=working;
    return out;
   }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}
   finally{client.release()}
  }
  const out=await fn(state);
  await persistFile(state);
  return out;
 });
 chain=run.catch(()=>{});
 return run;
}
export async function closeStore(){if(pool){const p=pool;pool=null;await p.end()}}
export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
