import test from "node:test";
import assert from "node:assert/strict";
import {inspectState,deterministicUuid} from "../scripts/preflight-json-import.js";

const base=()=>({
 workspaces:[{id:"ws_default"}],
 users:[{id:"u1",username:"owner",passwordHash:"$2b$hash",workspaceId:"ws_default"}],
 invitations:[],sessions:[],
 assets:[{id:"a1",workspaceId:"ws_default",url:"https://example.com",challenge:"never-print-this"}],
 findings:[],checks:[],audit:[],iocs:[{id:"i1",workspaceId:"ws_default",type:"domain",value:"example.com"}],
 alerts:[{id:"al1",workspaceId:"ws_default",title:"Test",severity:"high",iocId:"i1",assignee:"owner"}]
});

test("preflight accepts valid legacy workspace references and deterministically remaps IDs",()=>{
 const a=inspectState(base()),b=inspectState(base());
 assert.equal(a.ok,true);
 assert.equal(a.remappedIds.workspaces[0].id,b.remappedIds.workspaces[0].id);
 assert.match(deterministicUuid("users","u1"),/^[0-9a-f-]{36}$/);
});
test("preflight blocks orphaned cross-workspace references",()=>{
 const data=base();data.alerts[0].iocId="missing";
 const report=inspectState(data);
 assert.equal(report.ok,false);
 assert.ok(report.issues.some(x=>x.code==="IOC_NOT_FOUND"));
});
