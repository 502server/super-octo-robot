import crypto from "node:crypto";
export function hashToken(v){return crypto.createHash("sha256").update(v).digest("hex")}
export function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
export function normalizeOrigin(input){const u=new URL(input);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error("Only public HTTP(S) URLs are supported");if(["localhost","127.0.0.1","::1"].includes(u.hostname))throw Error("Loopback targets are not allowed");return u.origin}
export function isPrivateAddress(ip){
 const v=ip.toLowerCase();
 if(v.includes(":"))return v==="::"||v==="::1"||v.startsWith("fc")||v.startsWith("fd")||v.startsWith("fe8")||v.startsWith("fe9")||v.startsWith("fea")||v.startsWith("feb")||v.startsWith("ff")||v.startsWith("::ffff:");
 return v.startsWith("10.")||v.startsWith("192.168.")||/^172\\.(1[6-9]|2\\d|3[01])\\./.test(v)||v==="0.0.0.0"||v.startsWith("127.")||v.startsWith("169.254.");
}
