import { betterAuth } from "better-auth";
import { getMariaDbPool } from "./database.js";

const pool = getMariaDbPool();
const hosted =
  process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || process.env.V0_RUNTIME_URL;
if (!pool && hosted) throw new Error("MARIADB_URL is required for hosted OAuth authentication");
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
}

function exactOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

const baseURL =
  process.env.BETTER_AUTH_URL ||
  exactOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  exactOrigin(process.env.VERCEL_URL) ||
  exactOrigin(process.env.V0_RUNTIME_URL) ||
  "http://localhost:3000";

const oauthProviderStatus = {
  google: Boolean(pool && process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()),
  github: Boolean(pool && process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()),
};

const socialProviders = {};
if (oauthProviderStatus.google) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
  };
}
if (oauthProviderStatus.github) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID.trim(),
    clientSecret: process.env.GITHUB_CLIENT_SECRET.trim(),
  };
}

const developmentOrigins = [
  "http://localhost:3000",
  process.env.V0_RUNTIME_URL,
  process.env.V0_DEV_APP_URL,
  process.env.V0_BUILD_URL,
  process.env.V0_SANDBOX_URL,
]
  .map(exactOrigin)
  .filter(Boolean);

const productionOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .map(exactOrigin)
  .filter(Boolean);

export const authServer = pool
  ? betterAuth({
      database: pool,
      baseURL,
      emailAndPassword: { enabled: false },
      socialProviders,
      trustedOrigins: process.env.NODE_ENV === "development" ? developmentOrigins : productionOrigins,
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      ...(process.env.NODE_ENV === "development"
        ? {
            advanced: {
              defaultCookieAttributes: {
                sameSite: "none",
                secure: true,
              },
            },
          }
        : {}),
    })
  : null;

export { oauthProviderStatus };
