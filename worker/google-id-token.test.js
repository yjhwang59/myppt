import test from "node:test";
import assert from "node:assert/strict";
import { profileFromGooglePayload } from "./google-id-token.js";

const clientId = "client.apps.googleusercontent.com";

test("accepts a verified Google ID token payload", () => {
  const profile = profileFromGooglePayload(
    {
      iss: "https://accounts.google.com",
      aud: clientId,
      exp: 2_000,
      email: "person@example.com",
      email_verified: "true",
    },
    clientId,
    1_000
  );
  assert.deepEqual(profile, { email: "person@example.com", emailVerified: true });
});

test("rejects a token for another client or an unverified expiry", () => {
  assert.throws(() =>
    profileFromGooglePayload(
      { iss: "https://accounts.google.com", aud: "other", exp: 2_000, email_verified: true },
      clientId,
      1_000
    )
  );
  assert.throws(() =>
    profileFromGooglePayload(
      { iss: "https://accounts.google.com", aud: clientId, exp: 1, email_verified: true },
      clientId,
      1_000
    )
  );
});
