import test from "node:test";
import assert from "node:assert/strict";
import {hasMinimumRole,roleGuard,canAssignRole,sameWorkspace} from "../api/access.js";

test("role hierarchy is least-privilege ordered",()=>{
 const viewer={role:"viewer"},analyst={role:"analyst"},admin={role:"admin"},owner={role:"owner"};
 assert.equal(hasMinimumRole(viewer,"viewer"),true);
 assert.equal(hasMinimumRole(viewer,"analyst"),false);
 assert.equal(hasMinimumRole(analyst,"analyst"),true);
 assert.equal(hasMinimumRole(analyst,"admin"),false);
 assert.equal(hasMinimumRole(admin,"analyst"),true);
 assert.equal(hasMinimumRole(owner,"admin"),true);
});
test("admins cannot grant admin or owner privileges",()=>{
 assert.equal(canAssignRole({role:"admin"},"viewer"),true);
 assert.equal(canAssignRole({role:"admin"},"analyst"),true);
 assert.equal(canAssignRole({role:"admin"},"admin"),false);
 assert.equal(canAssignRole({role:"admin"},"owner"),false);
 assert.equal(canAssignRole({role:"owner"},"admin"),true);
 assert.equal(canAssignRole({role:"owner"},"owner"),false);
});
test("workspace records are isolated by exact workspace id",()=>{
 assert.equal(sameWorkspace({workspaceId:"workspace-a"},"workspace-a"),true);
 assert.equal(sameWorkspace({workspaceId:"workspace-b"},"workspace-a"),false);
 assert.equal(sameWorkspace({},"workspace-a"),false);
});
test("role middleware rejects missing and insufficient roles",()=>{
 const guard=roleGuard("owner","admin");
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
 let next=false;
 guard({user:{role:"analyst"}},res,()=>{next=true});
 assert.equal(next,false);assert.equal(res.statusCode,403);
 const allowed={statusCode:200};
 guard({user:{role:"owner"}},allowed,()=>{next=true});
 assert.equal(next,true);
});
