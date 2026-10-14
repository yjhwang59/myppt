import test from "node:test";
import assert from "node:assert/strict";
import { catalogFromRegistry } from "./catalog.js";

test("catalog groups decks under category names", () => {
  const catalog = catalogFromRegistry({
    categories: [
      { id: "strategy", name: "戰略與閱讀", sortOrder: 20, isActive: true },
      { id: "architecture", name: "架構", sortOrder: 10, isActive: true },
    ],
    decks: [
      { deckId: "portal", title: "入口", categoryId: "architecture", listed: true, sortOrder: 1 },
      { deckId: "notes", title: "筆記", categoryId: "", listed: false },
    ],
  });
  assert.equal(catalog.categories[0].id, "architecture");
  assert.equal(catalog.categories[0].deckCount, 1);
  assert.equal(catalog.decks[0].categoryName, "架構");
  assert.equal(catalog.decks[1].categoryName, "未分類");
  assert.equal(catalog.decks[1].listed, false);
});
