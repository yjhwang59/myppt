import { OAuth2Client } from "google-auth-library";

export async function verifyGoogleIdToken(idToken, clientId) {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: String(idToken || ""),
    audience: clientId,
  });
  const payload = ticket.getPayload() || {};
  return {
    email: String(payload.email || ""),
    emailVerified: payload.email_verified === true,
  };
}
