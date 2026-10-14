export function profileFromGooglePayload(payload, clientId, now = Date.now()) {
  const iss = payload?.iss;
  if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
    throw new Error("iss");
  }
  if (payload?.aud !== clientId) throw new Error("aud");
  const expMs = Number(payload?.exp) * 1000;
  if (!Number.isFinite(expMs) || expMs <= now) throw new Error("exp");
  const emailVerified = payload?.email_verified === true || payload?.email_verified === "true";
  return {
    email: String(payload?.email || ""),
    emailVerified,
  };
}

export async function verifyGoogleIdToken(idToken, clientId) {
  const token = String(idToken || "");
  if (!token || token.length > 8192) throw new Error("missing");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error("invalid");
  const payload = await res.json();
  return profileFromGooglePayload(payload, clientId);
}
