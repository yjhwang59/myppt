import test from "node:test";
import assert from "node:assert/strict";
import { bridgePageHtml, isAllowedLoginTarget } from "./login-bridge.js";

test("login bridge only returns to the studio origins", () => {
  assert.equal(isAllowedLoginTarget("http://localhost:8787"), true);
  assert.equal(isAllowedLoginTarget("http://127.0.0.1:8787"), true);
  assert.equal(isAllowedLoginTarget("https://myppt.aidc.work"), true);
  assert.equal(isAllowedLoginTarget("https://aidc.work"), false);
  assert.equal(isAllowedLoginTarget("https://evil.example"), false);
});

test("login bridge page posts the credential back to the opener", () => {
  const html = bridgePageHtml();
  assert.match(html, /myppt-google-credential/);
  assert.match(html, /#myppt_google=/);
  assert.match(html, /http:\/\/localhost:8787/);
  assert.match(html, /https:\/\/myppt\.aidc\.work/);
  assert.doesNotMatch(html, /client_secret/);
  assert.ok(html.includes("\\w"));
});
