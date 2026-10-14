import test from "node:test";
import assert from "node:assert/strict";
import { groupPublicCatalog, publicDecks } from "./catalog.js";

const registry = {
  version: 2,
  categories: [
    { id: "later", name: "後段", sortOrder: 20, isActive: true },
    { id: "early", name: "前段", sortOrder: 10, isActive: true, description: "先看這個" },
    { id: "paused", name: "暫停", sortOrder: 5, isActive: false },
  ],
  decks: [
    { deckId: "b", title: "乙", categoryId: "early", listed: true, sortOrder: 2, summary: "乙摘要" },
    { deckId: "a", title: "甲", categoryId: "early", listed: true, sortOrder: 1, summary: "" },
    { deckId: "hidden", title: "隱藏", categoryId: "early", listed: false, sortOrder: 0 },
    { deckId: "late", title: "後", categoryId: "later", listed: true, sortOrder: 0 },
    { deckId: "paused-deck", title: "暫停稿", categoryId: "paused", listed: true, sortOrder: 0 },
    { deckId: "loose", title: "未分類稿", categoryId: "", listed: true, sortOrder: 0 },
  ],
};

test("public catalog keeps listed decks in active categories", () => {
  const ids = publicDecks(registry).map((deck) => deck.deckId);
  assert.deepEqual(ids, ["b", "a", "late", "loose"]);
});

test("groups follow category order, then deck order", () => {
  const groups = groupPublicCatalog(registry);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["early", "later", ""]
  );
  assert.deepEqual(
    groups[0].decks.map((deck) => deck.deckId),
    ["a", "b"]
  );
  assert.equal(groups.at(-1).name, "未分類");
});

test("search and category filter narrow the groups", () => {
  const found = groupPublicCatalog(registry, { query: "乙摘要" });
  assert.deepEqual(found.map((group) => group.decks.map((deck) => deck.deckId)), [["b"]]);
  const onlyLater = groupPublicCatalog(registry, { categoryId: "later" });
  assert.deepEqual(onlyLater.map((group) => group.id), ["later"]);
});
