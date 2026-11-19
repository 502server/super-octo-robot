import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { authServer, oauthProviderStatus } from "./auth.js";
import * as lucideIcons from "lucide-static";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { z } from "zod";
import {
  loadStore,
  read,
  write,
  id,
  now,
  refreshStore,
  withStoreState,
  assetVerificationChallenge,
} from "./store.js";
import { hashToken, safeEqual, normalizeOrigin, isPrivateAddress } from "./security.js";
import { createAssistantRouter } from "./assistant.js";
import { createIntegrationRouter } from "./integrations.js";
import { createIntelligenceRouter } from "./intelligence.js";
import { createSystemRouter } from "./system.js";
import { createPlaygroundRouter } from "./playground.js";
import { roleGuard, canAssignRole, sameWorkspace } from "./access.js";
const app = express(),
  port = Number(process.env.PORT || 3000),
  bootstrapToken = process.env.BOOTSTRAP_TOKEN || "",
  sessionSecret = process.env.SESSION_SECRET || process.env.BETTER_AUTH_SECRET || "";
if (sessionSecret.length < 32) throw Error("SESSION_SECRET must be at least 32 characters");
if (bootstrapToken.length < 24) throw Error("BOOTSTRAP_TOKEN must be at least 24 characters");
if (process.env.TRUST_PROXY === "1" || process.env.VERCEL === "1" || process.env.V0_RUNTIME_URL)
  app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use((req, res, next) => {
  const origin = req.get("origin"),
    expected = process.env.ALLOWED_ORIGIN || req.protocol + "://" + req.get("host");
  if (origin && origin !== expected) return res.status(403).json({ error: "Cross-origin request blocked" });
  next();
});
app.use(
  "/api/auth",
  rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }),
);
const betterAuthHandler = authServer ? toNodeHandler(authServer) : null;
app.all("/api/auth/*", (req, res, next) => {
  if (!betterAuthHandler)
    return res.status(503).json({ error: "OAuth requires a configured MariaDB connection" });
  return betterAuthHandler(req, res, next);
});
app.use(express.json({ limit: "256kb" }));
app.use(async (req, res, next) => {
  try {
    const snapshot = await refreshStore();
    withStoreState(snapshot, next);
  } catch (error) {
    next(error);
  }
});
app.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
const limiter = rateLimit({ windowMs: 900000, limit: 10, standardHeaders: true, legacyHeaders: false });
const account = z.object({
  username: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[\w.-]+$/),
  password: z.string().min(12).max(200),
  bootstrapToken: z.string().min(24),
});
const login = z.object({ username: z.string().min(1).max(48), password: z.string().min(1).max(200) });
const assetSchema = z.object({
  name: z.string().min(2).max(100),
  url: z.string().url().max(2048),
  notes: z.string().max(500).optional().default(""),
});
const cookie = "fz_session";
const sign = (v) => crypto.createHmac("sha256", sessionSecret).update(v).digest("hex");
function tokenFrom(req) {
  const raw = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookie + "="))
    ?.slice(cookie.length + 1);
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split(".");
  return parts.length === 2 && safeEqual(parts[1], sign(parts[0])) ? parts[0] : null;
}
function setCookie(res, t) {
  res.cookie(cookie, t + "." + sign(t), {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "development" ? "none" : "lax",
    secure: process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production",
    maxAge: 28800000,
    path: "/",
  });
}
async function auth(req, res, next) {
  const t = tokenFrom(req);
  if (!t) return res.status(401).json({ error: "Authentication required" });
  const s = read((x) => x.sessions.find((y) => y.hash === hashToken(t) && y.expiresAt > Date.now()));
  if (!s) return res.status(401).json({ error: "Session expired" });
  req.user = read((x) => x.users.find((y) => y.id === s.userId));
  if (!req.user) return res.status(401).json({ error: "Invalid session" });
  req.workspaceId = req.user.workspaceId || s.workspaceId || "ws_default";
  next();
}
async function audit(uid, action, detail = "", workspaceId = "ws_default") {
  await write((s) => {
    s.audit.unshift({
      id: id(),
      workspaceId,
      userId: uid,
      action,
      detail: String(detail).slice(0, 200),
      at: now(),
    });
    s.audit = s.audit.slice(0, 1000);
  });
}
async function issueSession(user, res) {
  const t = crypto.randomBytes(32).toString("base64url");
  await write((s) =>
    s.sessions.push({
      id: id(),
      userId: user.id,
      workspaceId: user.workspaceId,
      hash: hashToken(t),
      expiresAt: Date.now() + 28800000,
    }),
  );
  setCookie(res, t);
}
function appUserFromRequest(req) {
  const t = tokenFrom(req);
  if (!t) return null;
  return read((s) => {
    const session = s.sessions.find((x) => x.hash === hashToken(t) && x.expiresAt > Date.now());
    return session ? s.users.find((x) => x.id === session.userId) || null : null;
  });
}
async function oauthIdentityFromRequest(req) {
  try {
    return (await authServer.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user || null;
  } catch {
    return null;
  }
}
function oauthUsername(identity) {
  const base =
    String(identity.name || identity.email?.split("@")[0] || "analyst")
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "")
      .slice(0, 36) || "analyst";
  return `${base}-${id().slice(0, 6)}`;
}
function oauthAppUser(identity, role, workspaceId) {
  return {
    id: id(),
    username: oauthUsername(identity),
    name: identity.name || identity.email,
    email: identity.email,
    oauthIdentityIds: [identity.id],
    role,
    workspaceId,
    createdAt: now(),
  };
}
const iconTones = {
  muted: "#929292",
  accent: "#e02020",
  critical: "#f04444",
  white: "#e6edf7",
  blue: "#77a8ff",
  amber: "#f2b96c",
};
const appIcons = new Set([
  "Activity",
  "CircleHelp",
  "BadgeCheck",
  "Bell",
  "BriefcaseBusiness",
  "Bug",
  "ChartNoAxesColumnIncreasing",
  "ClipboardList",
  "Cloud",
  "CodeXml",
  "Command",
  "Cpu",
  "Crosshair",
  "Database",
  "Download",
  "Eye",
  "FileChartColumn",
  "Fish",
  "Globe",
  "KeyRound",
  "LayoutDashboard",
  "ListChecks",
  "ListTodo",
  "LogOut",
  "Megaphone",
  "PlugZap",
  "Radio",
  "RefreshCw",
  "ScanEye",
  "ScanSearch",
  "Search",
  "Server",
  "Settings",
  "Shield",
  "ShieldAlert",
  "ShieldCheck",
  "Terminal",
  "TriangleAlert",
  "Users",
  "UsersRound",
  "Workflow",
]);
app.get(["/icons/:name.svg", "/api/icons/:name.svg"], (req, res) => {
  const name = req.params.name,
    svg = appIcons.has(name) && Object.hasOwn(lucideIcons, name) ? lucideIcons[name] : null;
  if (typeof svg !== "string") return res.status(404).end();
  const tone = iconTones[req.query.tone] || iconTones.muted;
  res
    .type("image/svg+xml")
    .set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
    .send(svg.replaceAll("currentColor", tone));
});
app.get("/api/health", (_, res) => res.json({ ok: true, service: "fivezero2.group", time: now() }));
app.get("/api/auth-status", (_, res) => res.json({ providers: oauthProviderStatus }));
app.use("/api/assistant", createAssistantRouter(auth));
app.use("/api/integrations", createIntegrationRouter(auth));
app.use("/api/intel", createIntelligenceRouter(auth));
app.use("/api/system", createSystemRouter(auth));
app.use("/api/playground", createPlaygroundRouter(auth));
app.post("/api/oauth/complete", async (req, res) => {
  const identity = await oauthIdentityFromRequest(req);
  if (!identity) return res.status(401).json({ error: "OAuth session was not found. Sign in again." });
  if (typeof identity.email !== "string" || identity.emailVerified !== true)
    return res.status(403).json({ error: "A verified Google or GitHub email is required." });
  const legacyUser = appUserFromRequest(req);
  let linkedUser = read((s) =>
    s.users.find(
      (u) =>
        (Array.isArray(u.oauthIdentityIds) && u.oauthIdentityIds.includes(identity.id)) ||
        u.authUserId === identity.id ||
        (u.email && u.email.toLowerCase() === identity.email.toLowerCase()),
    ),
  );
  if (legacyUser) {
    if (linkedUser && linkedUser.id !== legacyUser.id)
      return res.status(409).json({ error: "This provider account is linked to another workspace member." });
    linkedUser = await write((s) => {
      const user = s.users.find((u) => u.id === legacyUser.id);
      if (!user) return null;
      const ids = Array.isArray(user.oauthIdentityIds) ? user.oauthIdentityIds : [];
      if (!ids.includes(identity.id)) ids.push(identity.id);
      user.oauthIdentityIds = ids;
      user.authUserId = identity.id;
      user.email = user.email || identity.email;
      user.name = user.name || identity.name || identity.email;
      return user;
    });
    if (!linkedUser) return res.status(404).json({ error: "Workspace member not found." });
    await issueSession(linkedUser, res);
    await audit(linkedUser.id, "auth.oauth.link", "OAuth identity linked", linkedUser.workspaceId);
    return res.json({ authenticated: true });
  }
  if (linkedUser) {
    linkedUser = await write((s) => {
      const user = s.users.find((u) => u.id === linkedUser.id);
      if (!user) return null;
      const ids = Array.isArray(user.oauthIdentityIds) ? user.oauthIdentityIds : [];
      if (!ids.includes(identity.id)) ids.push(identity.id);
      user.oauthIdentityIds = ids;
      user.authUserId = user.authUserId || identity.id;
      user.email = user.email || identity.email;
      user.name = user.name || identity.name || identity.email;
      return user;
    });
    if (!linkedUser) return res.status(404).json({ error: "Workspace member not found." });
    await issueSession(linkedUser, res);
    await audit(linkedUser.id, "auth.oauth.login", "OAuth sign-in", linkedUser.workspaceId);
    return res.json({ authenticated: true });
  }
  return res.json({
    authenticated: false,
    needsBootstrap: read((s) => s.users.length === 0),
    email: identity.email,
    name: identity.name || identity.email,
  });
});
app.post("/api/oauth/accept-invitation", limiter, async (req, res) => {
  const identity = await oauthIdentityFromRequest(req);
  if (!identity) return res.status(401).json({ error: "OAuth session was not found. Sign in again." });
  if (typeof identity.email !== "string" || identity.emailVerified !== true)
    return res.status(403).json({ error: "A verified Google or GitHub email is required." });
  const p = z.object({ invitationToken: z.string().min(32).max(200) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid invitation token" });
  const tokenHash = hashToken(p.data.invitationToken),
    invitation = read((s) =>
      s.invitations.find((x) => x.tokenHash === tokenHash && !x.usedAt && x.expiresAt > Date.now()),
    );
  if (!invitation) return res.status(400).json({ error: "Invitation is invalid, expired, or already used" });
  const member = oauthAppUser(identity, invitation.role, invitation.workspaceId);
  const accepted = await write((s) => {
    const current = s.invitations.find((x) => x.id === invitation.id);
    if (
      !current ||
      current.usedAt ||
      current.expiresAt <= Date.now() ||
      s.users.some(
        (u) =>
          u.authUserId === identity.id ||
          (Array.isArray(u.oauthIdentityIds) && u.oauthIdentityIds.includes(identity.id)),
      )
    )
      return false;
    current.usedAt = now();
    s.users.push(member);
    return true;
  });
  if (!accepted)
    return res.status(409).json({ error: "Invitation was already used or this account is already linked." });
  await issueSession(member, res);
  await audit(member.id, "workspace.invitation.accept.oauth", member.role, member.workspaceId);
  res
    .status(201)
    .json({ user: { username: member.username, role: member.role, workspaceId: member.workspaceId } });
});
app.post("/api/oauth/bootstrap", limiter, async (req, res) => {
  const identity = await oauthIdentityFromRequest(req);
  if (!identity) return res.status(401).json({ error: "OAuth session was not found. Sign in again." });
  if (typeof identity.email !== "string" || identity.emailVerified !== true)
    return res.status(403).json({ error: "A verified Google or GitHub email is required." });
  const p = z.object({ bootstrapToken: z.string().min(24) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid bootstrap token" });
  if (!safeEqual(p.data.bootstrapToken, bootstrapToken))
    return res.status(403).json({ error: "Invalid bootstrap token" });
  if (read((s) => s.users.length)) return res.status(409).json({ error: "Owner already initialized" });
  const workspaceId = id(),
    owner = oauthAppUser(identity, "owner", workspaceId);
  const initialized = await write((s) => {
    if (s.users.length) return false;
    s.workspaces.push({
      id: workspaceId,
      name: "Default Workspace",
      slug: "default",
      createdAt: now(),
      createdBy: owner.id,
    });
    s.users.push(owner);
    return true;
  });
  if (!initialized) return res.status(409).json({ error: "Owner already initialized" });
  await issueSession(owner, res);
  await audit(owner.id, "owner.bootstrap.oauth", "Default workspace initialized", workspaceId);
  res.status(201).json({ user: { username: owner.username, role: owner.role, workspaceId } });
});
app.post("/api/session/bootstrap", limiter, async (req, res) => {
  const p = account.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid account data" });
  if (!safeEqual(p.data.bootstrapToken, bootstrapToken))
    return res.status(403).json({ error: "Invalid bootstrap token" });
  if (read((s) => s.users.length)) return res.status(409).json({ error: "Owner already initialized" });
  const workspaceId = id();
  const u = {
    id: id(),
    username: p.data.username,
    passwordHash: await bcrypt.hash(p.data.password, 12),
    role: "owner",
    workspaceId,
    createdAt: now(),
  };
  await write((s) => {
    s.workspaces.push({
      id: workspaceId,
      name: "Default Workspace",
      slug: "default",
      createdAt: now(),
      createdBy: u.id,
    });
    s.users.push(u);
  });
  await issueSession(u, res);
  await audit(u.id, "owner.bootstrap", "Default workspace initialized", workspaceId);
  res.status(201).json({ user: { username: u.username, role: u.role, workspaceId } });
});
app.post("/api/session/login", limiter, async (req, res) => {
  const p = login.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid credentials" });
  const u = read((s) => s.users.find((x) => x.username === p.data.username));
  if (!u?.passwordHash || !(await bcrypt.compare(p.data.password, u.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });
  await issueSession(u, res);
  await audit(u.id, "auth.login", "", u.workspaceId);
  res.json({ user: { username: u.username, role: u.role, workspaceId: u.workspaceId } });
});
app.post("/api/session/logout", auth, async (req, res) => {
  const t = tokenFrom(req);
  await write((s) => {
    s.sessions = s.sessions.filter((x) => x.hash !== hashToken(t));
  });
  res.clearCookie(cookie, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "development" ? "none" : "lax",
    secure: process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production",
    path: "/",
  });
  await audit(req.user.id, "auth.logout", "", req.workspaceId);
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) =>
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email || null,
      oauthLinked: Boolean(req.user.authUserId || (req.user.oauthIdentityIds || []).length),
      role: req.user.role,
      workspaceId: req.workspaceId,
    },
  }),
);
app.get("/api/workspace", auth, (req, res) => {
  const workspace = read((s) => s.workspaces.find((x) => x.id === req.workspaceId));
  if (!workspace) return res.status(404).json({ error: "Workspace not found" });
  res.json({ workspace, role: req.user.role, user: { id: req.user.id, username: req.user.username } });
});
app.get("/api/workspace/members", auth, roleGuard("owner", "admin"), (req, res) => {
  const members = read((s) =>
    s.users
      .filter((x) => sameWorkspace(x, req.workspaceId))
      .map((x) => ({ id: x.id, username: x.username, role: x.role, createdAt: x.createdAt })),
  );
  res.json({ members });
});
app.post("/api/workspace/invitations", auth, roleGuard("owner", "admin"), limiter, async (req, res) => {
  const p = z.object({ role: z.enum(["admin", "analyst", "viewer"]) }).safeParse(req.body);
  if (!p.success || !canAssignRole(req.user, p.data?.role))
    return res.status(403).json({ error: "Role assignment is not permitted" });
  if (
    read(
      (s) =>
        s.invitations.filter(
          (x) => x.workspaceId === req.workspaceId && !x.usedAt && x.expiresAt > Date.now(),
        ).length,
    ) >= 25
  )
    return res.status(429).json({ error: "Workspace has reached the pending invitation limit" });
  const token = crypto.randomBytes(32).toString("base64url"),
    invitation = {
      id: id(),
      workspaceId: req.workspaceId,
      tokenHash: hashToken(token),
      role: p.data.role,
      createdBy: req.user.id,
      createdAt: now(),
      expiresAt: Date.now() + 86400000,
      usedAt: null,
    };
  await write((s) => s.invitations.push(invitation));
  await audit(req.user.id, "workspace.invitation.create", invitation.role, req.workspaceId);
  res.status(201).json({
    invitation: { id: invitation.id, role: invitation.role, expiresAt: invitation.expiresAt, token },
  });
});
app.post("/api/session/accept-invitation", limiter, async (req, res) => {
  const p = z
    .object({
      invitationToken: z.string().min(32).max(200),
      username: z
        .string()
        .min(3)
        .max(48)
        .regex(/^[\w.-]+$/),
      password: z.string().min(12).max(200),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid invitation acceptance data" });
  const invitation = read((s) =>
    s.invitations.find(
      (x) => x.tokenHash === hashToken(p.data.invitationToken) && !x.usedAt && x.expiresAt > Date.now(),
    ),
  );
  if (!invitation) return res.status(400).json({ error: "Invitation is invalid, expired, or already used" });
  if (read((s) => s.users.some((x) => x.username.toLowerCase() === p.data.username.toLowerCase())))
    return res.status(409).json({ error: "Username is already in use" });
  const user = {
    id: id(),
    username: p.data.username,
    passwordHash: await bcrypt.hash(p.data.password, 12),
    role: invitation.role,
    workspaceId: invitation.workspaceId,
    createdAt: now(),
  };
  const accepted = await write((s) => {
    const current = s.invitations.find((x) => x.id === invitation.id);
    if (!current || current.usedAt || current.expiresAt <= Date.now()) return false;
    current.usedAt = now();
    s.users.push(user);
    return true;
  });
  if (!accepted) return res.status(409).json({ error: "Invitation was already used" });
  await issueSession(user, res);
  await audit(user.id, "workspace.invitation.accept", invitation.role, invitation.workspaceId);
  res.status(201).json({ user: { username: user.username, role: user.role, workspaceId: user.workspaceId } });
});
app.patch("/api/workspace/members/:userId", auth, roleGuard("owner", "admin"), async (req, res) => {
  const p = z.object({ role: z.enum(["admin", "analyst", "viewer"]) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid role" });
  if (!canAssignRole(req.user, p.data.role))
    return res.status(403).json({ error: "Role assignment is not permitted" });
  const target = read((s) =>
    s.users.find((x) => x.id === req.params.userId && sameWorkspace(x, req.workspaceId)),
  );
  if (!target || target.role === "owner") return res.status(404).json({ error: "Member not found" });
  if (req.user.role === "admin" && target.role === "admin")
    return res.status(403).json({ error: "Admins cannot change another admin" });
  const updated = await write((s) => {
    const u = s.users.find((x) => x.id === target.id);
    u.role = p.data.role;
    return { id: u.id, username: u.username, role: u.role };
  });
  await audit(req.user.id, "workspace.member.role.update", target.id + ":" + p.data.role, req.workspaceId);
  res.json({ member: updated });
});
app.get("/api/assets", auth, (req, res) =>
  res.json({ assets: read((s) => s.assets.filter((x) => sameWorkspace(x, req.workspaceId))) }),
);
app.post("/api/assets", auth, roleGuard("owner", "admin", "analyst"), async (req, res) => {
  const p = assetSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid asset", issues: p.error.issues });
  let origin;
  try {
    origin = normalizeOrigin(p.data.url);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const assetId = id();
  const a = {
    id: assetId,
    workspaceId: req.workspaceId,
    name: p.data.name,
    url: origin,
    notes: p.data.notes,
    verified: false,
    challenge: assetVerificationChallenge(assetId),
    createdAt: now(),
    createdBy: req.user.id,
  };
  await write((s) => s.assets.unshift(a));
  await audit(req.user.id, "asset.create", origin, req.workspaceId);
  res.status(201).json({ asset: a });
});
app.post("/api/assets/:id/verify", auth, roleGuard("owner", "admin", "analyst"), async (req, res) => {
  const a = read((s) => s.assets.find((x) => x.id === req.params.id && sameWorkspace(x, req.workspaceId)));
  if (!a) return res.status(404).json({ error: "Asset not found" });
  try {
    const records = await dns.resolveTxt("_fivezero2-verify." + new URL(a.url).hostname);
    if (!records.flat().includes(a.challenge))
      return res.status(400).json({ verified: false, error: "TXT challenge not found" });
    await write((s) => {
      const x = s.assets.find((y) => y.id === a.id);
      x.verified = true;
      x.verifiedAt = now();
    });
    await audit(req.user.id, "asset.verify", a.url, req.workspaceId);
    res.json({ verified: true });
  } catch {
    return res.status(400).json({ verified: false, error: "DNS TXT record could not be confirmed" });
  }
});
app.post("/api/assets/:id/check", auth, roleGuard("owner", "admin", "analyst"), async (req, res) => {
  const a = read((s) => s.assets.find((x) => x.id === req.params.id && sameWorkspace(x, req.workspaceId)));
  if (!a) return res.status(404).json({ error: "Asset not found" });
  if (!a.verified) return res.status(403).json({ error: "Verify DNS ownership before checking" });
  const u = new URL(a.url);
  let ips;
  try {
    ips = await dns.lookup(u.hostname, { all: true, verbatim: true });
  } catch {
    return res.status(400).json({ error: "DNS lookup failed" });
  }
  if (!ips.length || ips.some((x) => isPrivateAddress(x.address)))
    return res.status(400).json({ error: "Private or unresolved target blocked" });
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), 8000);
  let result;
  try {
    const r = await fetch(a.url, {
      method: "GET",
      redirect: "manual",
      signal: ctl.signal,
      headers: { "user-agent": "fivezero2-asset-check/0.3" },
    });
    result = {
      status: r.status,
      ok: r.status >= 200 && r.status < 400,
      https: u.protocol === "https:",
      checkedAt: now(),
    };
  } catch {
    result = {
      status: null,
      ok: false,
      https: u.protocol === "https:",
      checkedAt: now(),
      error: "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
  await write((s) => s.checks.unshift({ id: id(), workspaceId: req.workspaceId, assetId: a.id, ...result }));
  await audit(req.user.id, "asset.check", a.url, req.workspaceId);
  res.json({ result });
});
app.get("/api/findings", auth, (req, res) =>
  res.json({ findings: read((s) => s.findings.filter((x) => sameWorkspace(x, req.workspaceId))) }),
);
app.patch("/api/findings/:id", auth, roleGuard("owner", "admin", "analyst"), async (req, res) => {
  const p = z.enum(["open", "accepted", "fixed", "false_positive"]).safeParse(req.body.status);
  if (!p.success) return res.status(400).json({ error: "Invalid status" });
  const f = await write((s) => {
    const x = s.findings.find((y) => y.id === req.params.id && sameWorkspace(y, req.workspaceId));
    if (x) x.status = p.data;
    return x;
  });
  if (!f) return res.status(404).json({ error: "Finding not found" });
  await audit(req.user.id, "finding.update", req.params.id, req.workspaceId);
  res.json({ finding: f });
});
app.get("/api/audit", auth, (req, res) =>
  res.json({ events: read((s) => s.audit.filter((x) => sameWorkspace(x, req.workspaceId)).slice(0, 200)) }),
);
if (process.env.NODE_ENV === "production" && process.env.VERCEL !== "1") app.use(express.static("public"));
app.get("/", (_req, res) => res.redirect(302, "/index.html"));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
await loadStore();
if (process.env.VERCEL !== "1") {
  app.listen(port, process.env.HOST || "0.0.0.0", () => console.log("fivezero2.group listening on " + port));
}

export default app;
