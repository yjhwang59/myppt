import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrivateIp,
  rewriteInternalAnchors,
  safeAssetName,
  titleFromHtml,
} from "./html-import.js";

test("isPrivateIp covers common ranges", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.1.2.3"), true);
  assert.equal(isPrivateIp("192.168.1.1"), true);
  assert.equal(isPrivateIp("172.16.0.1"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("safeAssetName maps FYH logo and sanitizes names", () => {
  const used = new Set();
  assert.equal(safeAssetName("/大成Logo-transparent.png", used), "dachan-logo.png");
  assert.equal(safeAssetName("/docs/assets/deck/deck-chrome.css", used), "deck-chrome.css");
  assert.equal(safeAssetName("/docs/assets/deck/deck-chrome.css", used), "deck-chrome-2.css");
});

test("titleFromHtml reads title tag", () => {
  assert.equal(titleFromHtml("<title>營運通系統現況 | 主管會議簡報</title>", "x"), "營運通系統現況 | 主管會議簡報");
  assert.equal(titleFromHtml("<html></html>", "fallback"), "fallback");
});

test("rewriteInternalAnchors prefixes FYH origin", () => {
  const html = rewriteInternalAnchors(
    '<a href="/shop">店</a><a href="https://example.com">外</a><a href="/docs/assets/deck/x.css">css</a>',
    "https://fyh.aidc.work"
  );
  assert.match(html, /https:\/\/fyh\.aidc\.work\/shop/);
  assert.match(html, /https:\/\/example\.com/);
  assert.match(html, /href="\/docs\/assets\/deck\/x\.css"/);
});
