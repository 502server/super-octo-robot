import test from "node:test";
import assert from "node:assert/strict";
import {buildImportPlan} from "../scripts/import-json-to-postgres.js";

const state=()=>({
 workspaces:[{id:"ws_default",name:"Default",slug:"default",createdBy:"u1"}],
 users:[{id:"u1",username:"owner",passwordHash:"$2b$example",workspaceId:"ws_default",role:"owner",createdAt:"2026-01-01T00:00:00.000Z"}],
 invitations:[],sessions:[{id:"s1",userId:"u1",workspaceId:"ws_default",hash:"a".repeat(64),expiresAt:9999999999999}],
 assets:[{id:"a1",workspaceId:"ws_default",name:"Example",url:"https://example.com",challenge:"private-challenge",verified:false,createdBy:"u1"}],
 findings:[],checks:[],audit:[],
 iocs:[{id:"i1",workspaceId:"ws_default",type:"domain",value:"example.com",mitre:["T1071"],sources:["manual"],createdBy:"u1"}],
 alerts:[{id:"al1",workspaceId:"ws_default",title:"IOC alert",severity:"high",status:"open",iocId:"i1",assignee:"owner",createdBy:"u1"}]
});
test("builds deterministic tenant-safe import plan and preserves hashed live sessions",()=>{
 const a=buildImportPlan(state(),"a".repeat(64)),b=buildImportPlan(state(),"a".repeat(64));
 assert.equal(a.ok,true);
 assert.deepEqual(a.counts,b.counts);
 assert.equal(a.tables.sessions.length,1);
 assert.equal(a.tables.sessions[0].token_hash,"a".repeat(64));
 assert.equal(a.tables.alerts[0].assignee_user_id,a.tables.workspace_memberships[0].user_id);
 assert.notEqual(a.tables.assets[0].verification_challenge_hash,"private-challenge");
 assert.equal(a.tables.assets[0].verification_challenge_hash.length,64);
});
test("rejects orphaned indicator references before database connection",()=>{
 const data=state();data.alerts[0].iocId="missing";
 const plan=buildImportPlan(data,"b".repeat(64));
 assert.equal(plan.ok,false);
 assert.ok(plan.issues.some(x=>x.code==="IOC_NOT_FOUND"));
});
