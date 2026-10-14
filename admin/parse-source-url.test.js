import assert from "node:assert/strict";
import test from "node:test";
import { findExistingDeck, parseSourceUrl, suggestAsciiSlug } from "./parse-source-url.js";

const FYH_ENCODED =
  "https://fyh.aidc.work/docs/%E7%87%9F%E9%81%8B%E9%80%9A-%E7%B3%BB%E7%B5%B1%E7%8F%BE%E6%B3%81-%E4%B8%BB%E7%AE%A1%E6%9C%83%E8%AD%B0%E7%B0%A1%E5%A0%B1.html";

test("parseSourceUrl decodes percent-encoded Chinese filename", () => {
  const parsed = parseSourceUrl(FYH_ENCODED);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, "營運通-系統現況-主管會議簡報");
  assert.equal(parsed.fileName, "營運通-系統現況-主管會議簡報.html");
  assert.equal(parsed.slug, "");
});

test("parseSourceUrl accepts already-decoded path", () => {
  const parsed = parseSourceUrl("https://fyh.aidc.work/docs/營運通-系統現況-主管會議簡報.html");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, "營運通-系統現況-主管會議簡報");
});

test("parseSourceUrl rejects bad input", () => {
  assert.equal(parseSourceUrl("").ok, false);
  assert.equal(parseSourceUrl("ftp://example.com/a.html").ok, false);
  assert.equal(parseSourceUrl("not a url").ok, false);
});

test("suggestAsciiSlug keeps ascii names and drops CJK", () => {
  assert.equal(suggestAsciiSlug("enterprise-ai-portal-deck.html"), "enterprise-ai-portal-deck");
  assert.equal(suggestAsciiSlug("營運通-系統現況"), "");
});

test("findExistingDeck matches title or deckId", () => {
  const decks = [{ deckId: "deck-mu0p8shg", title: "營運通-系統現況-主管會議簡報" }];
  assert.equal(findExistingDeck(decks, { title: "營運通-系統現況-主管會議簡報" })?.deckId, "deck-mu0p8shg");
  assert.equal(findExistingDeck(decks, { deckId: "deck-mu0p8shg" })?.title, "營運通-系統現況-主管會議簡報");
  assert.equal(findExistingDeck(decks, { title: "其他" }), null);
});
