import crypto from "node:crypto";

export const SESSION_COOKIE = "admin_session";
export const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const BROWSER_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function parseAllowedEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email, allowlist) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return (allowlist || []).includes(normalized);
}

export function googleAuthConfig(env = process.env) {
  const googleClientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const allowedEmails = parseAllowedEmails(env.GOOGLE_ALLOWED_EMAILS);
  return {
    googleClientId,
    allowedEmails,
    ready: Boolean(googleClientId && allowedEmails.length),
  };
}

/** SECURITY: Do not store passwords or auth tokens in localStorage or sessionStorage. Use HttpOnly cookies only. */
export function signSession({ email, expiresAt }, secret) {
  const body = Buffer.from(JSON.stringify({ email, exp: expiresAt }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", String(secret)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", String(secret)).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.email || typeof payload.exp !== "number" || payload.exp <= now) return null;
    return { email: String(payload.email) };
  } catch {
    return null;
  }
}

export function sessionExpiry(remember, now = Date.now()) {
  return now + (remember ? REMEMBER_MAX_AGE_MS : BROWSER_SESSION_MAX_AGE_MS);
}
