export const ROLES=Object.freeze(["owner","admin","analyst","viewer"]);
const LEVEL=Object.freeze({viewer:1,analyst:2,admin:3,owner:4});
export function hasMinimumRole(user,minimum){return Boolean(user&&LEVEL[user.role]>=LEVEL[minimum])}
export function roleGuard(...allowed){return (req,res,next)=>allowed.includes(req.user?.role)?next():res.status(403).json({error:"Insufficient role"})}
export function sameWorkspace(record,workspaceId){return Boolean(record&&record.workspaceId===workspaceId)}
export function canAssignRole(actor,target){if(!ROLES.includes(target)||target==="owner")return false;if(actor?.role==="owner")return true;return actor?.role==="admin"&&(target==="analyst"||target==="viewer")}
