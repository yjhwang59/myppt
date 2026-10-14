import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCreateCategory,
  applyDeleteCategory,
  applyDeckCatalog,
  applyUpdateCategory,
  applyUpsertEntry,
  isLegacyHiddenDeck,
  migrateRegistry,
} from "./registry.js";

const v1 = {
  version: 1,
  decks: [
    { deckId: "enterprise-ai-portal-deck", title: "企業 AI 入口網整合平台架構", sourceType: "html" },
    { deckId: "aidc-work-system-architecture", title: "aidc-work-system-architecture", sourceType: "html" },
    { deckId: "taiwan-ai-strategic-blueprint", title: "Taiwan_AI_Strategic_Blueprint", sourceType: "pdf" },
    { deckId: "aidc-blog-reading-path", title: "Blog 分類與閱讀路徑", sourceType: "html" },
    { deckId: "fyh-bigdata-production-forecast", title: "fyhGoogle｜巨量資料分析｜次日生產預估", sourceType: "html" },
    { deckId: "test-upload-deck", title: "測試上傳簡報", sourceType: "html" },
    { deckId: "fyhgoogle-2026-w38", title: "週報", sourceType: "html" },
    { deckId: "deck", title: "FYH", sourceType: "html" },
    { deckId: "custom-public-deck", title: "自訂公開", sourceType: "html" },
  ],
};

test("migrateRegistry assigns categories, listing, and known titles once", () => {
  const migrated = migrateRegistry(v1);
  assert.equal(migrated.version, 2);
  assert.ok(migrated.categories.some((item) => item.id === "architecture"));

  const byId = Object.fromEntries(migrated.decks.map((deck) => [deck.deckId, deck]));
  assert.equal(byId["enterprise-ai-portal-deck"].categoryId, "architecture");
  assert.equal(byId["enterprise-ai-portal-deck"].listed, true);
  assert.equal(byId["aidc-work-system-architecture"].title, "AIDC.work 系統架構");
  assert.equal(byId["taiwan-ai-strategic-blueprint"].title, "台灣 AI 戰略藍圖");
  assert.equal(byId["aidc-blog-reading-path"].categoryId, "strategy");
  assert.equal(byId["fyh-bigdata-production-forecast"].categoryId, "bigdata");
  assert.equal(byId["fyh-bigdata-production-forecast"].listed, true);
  assert.equal(byId["test-upload-deck"].listed, false);
  assert.equal(byId["test-upload-deck"].categoryId, "internal");
  assert.equal(byId["fyhgoogle-2026-w38"].listed, false);
  assert.equal(byId.deck.listed, false);
  assert.equal(byId["custom-public-deck"].listed, true);
  assert.equal(byId["custom-public-deck"].categoryId, "");

  const again = migrateRegistry(migrated);
  again.decks.find((deck) => deck.deckId === "custom-public-deck").title = "使用者改過";
  const third = migrateRegistry(again);
  assert.equal(third.decks.find((deck) => deck.deckId === "custom-public-deck").title, "使用者改過");
  assert.equal(JSON.stringify(migrateRegistry(third)), JSON.stringify(third));
});

test("upsert keeps catalog fields unless the caller sets them", () => {
  const migrated = migrateRegistry(v1);
  const kept = applyUpsertEntry(migrated, {
    deckId: "enterprise-ai-portal-deck",
    title: "企業 AI 入口網整合平台架構",
    sourceType: "html",
  });
  const deck = kept.decks.find((item) => item.deckId === "enterprise-ai-portal-deck");
  assert.equal(deck.categoryId, "architecture");
  assert.equal(deck.listed, true);

  const changed = applyUpsertEntry(kept, {
    deckId: "enterprise-ai-portal-deck",
    title: "企業 AI 入口網整合平台架構",
    sourceType: "html",
    listed: false,
    categoryId: "strategy",
    sortOrder: 4,
    summary: "架構總覽",
  });
  const next = changed.decks.find((item) => item.deckId === "enterprise-ai-portal-deck");
  assert.equal(next.listed, false);
  assert.equal(next.categoryId, "strategy");
  assert.equal(next.sortOrder, 4);
  assert.equal(next.summary, "架構總覽");
});

test("category create, rename, and delete with reassignment", () => {
  let registry = migrateRegistry({ version: 1, decks: [] });
  ({ registry } = applyCreateCategory(registry, { id: "labs", name: "實驗", sortOrder: 15, isActive: true }));
  assert.throws(() => applyCreateCategory(registry, { id: "labs", name: "另一個" }), /分類代碼已存在/);
  assert.throws(() => applyCreateCategory(registry, { id: "bad id", name: "名稱" }), /格式無效/);

  ({ registry } = applyDeckCatalog(registry, "sample-deck", {
    title: "範例",
    categoryId: "labs",
    listed: true,
  }));
  assert.throws(() => applyDeleteCategory(registry, "labs"), /仍有 1 份簡報/);

  ({ registry } = applyUpdateCategory(registry, "labs", { id: "lab-notes", name: "實驗筆記" }));
  assert.equal(registry.decks[0].categoryId, "lab-notes");

  ({ registry } = applyDeleteCategory(registry, "lab-notes", { reassignTo: "architecture" }));
  assert.equal(registry.categories.some((item) => item.id === "lab-notes"), false);
  assert.equal(registry.decks[0].categoryId, "architecture");
});

test("legacy hidden ids", () => {
  assert.equal(isLegacyHiddenDeck("deck"), true);
  assert.equal(isLegacyHiddenDeck("test-pdf-deck"), true);
  assert.equal(isLegacyHiddenDeck("fyhgoogle-2026-w37"), true);
  assert.equal(isLegacyHiddenDeck("fyh-bigdata-production-forecast"), false);
});
