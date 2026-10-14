import test from "node:test";
import assert from "node:assert/strict";
import {
  googleAuthConfig,
  isEmailAllowed,
  parseAllowedEmails,
  readSession,
  signSession,
} from "./session.js";

test("allowlist ignores case and blank entries", () => {
  const list = parseAllowedEmails(" Alice@Example.com, ,bob@example.com ");
  assert.deepEqual(list, ["alice@example.com", "bob@example.com"]);
  assert.equal(isEmailAllowed("ALICE@example.com", list), true);
  assert.equal(isEmailAllowed("nope@example.com", list), false);
});

test("google config is ready only when client id and allowlist exist", () => {
  assert.equal(googleAuthConfig({ GOOGLE_CLIENT_ID: "", GOOGLE_ALLOWED_EMAILS: "" }).ready, false);
  assert.equal(
    googleAuthConfig({ GOOGLE_CLIENT_ID: "client", GOOGLE_ALLOWED_EMAILS: "a@b.c" }).ready,
    true
  );
  assert.equal(googleAuthConfig({ GOOGLE_CLIENT_ID: "client", GOOGLE_ALLOWED_EMAILS: "  " }).ready, false);
});

test("signed session expires and rejects a bad signature", () => {
  const secret = "test-secret";
  const token = signSession({ email: "a@b.c", expiresAt: 5_000 }, secret);
  assert.deepEqual(readSession(token, secret, 4_000), { email: "a@b.c" });
  assert.equal(readSession(token, secret, 5_000), null);
  assert.equal(readSession(`${token}x`, secret, 4_000), null);
  assert.equal(readSession(token, "other-secret", 4_000), null);
});
