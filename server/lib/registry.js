import fs from "node:fs";
import path from "node:path";
import {
  DECKS_DIR,
  DECK_ID_RE,
  NARRATION_DIR,
  PRESENTATIONS_DIR,
  REGISTRY_PATH,
  deckHtmlPath,
  isValidDeckId,
  manifestPath,
  slidesJsonPath,
} from "../../scripts/narration/lib/paths.js";
import { readManifest } from "../../scripts/narration/lib/manifest.js";

export class CatalogError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = "CatalogError";
    this.status = status;
    this.deckCount = extra.deckCount;
  }
}

export const SEED_CATEGORIES = [
  { id: "architecture", name: "架構", description: "", sortOrder: 10, isActive: true },
  { id: "strategy", name: "戰略與閱讀", description: "", sortOrder: 20, isActive: true },
  { id: "bigdata", name: "巨量資料", description: "", sortOrder: 30, isActive: true },
  { id: "internal", name: "內部", description: "週報與測試，預設不上架", sortOrder: 90, isActive: true },
];

const DECK_CATEGORY = {
  "enterprise-ai-portal-deck": "architecture",
  "aidc-work-system-architecture": "architecture",
  "taiwan-ai-strategic-blueprint": "strategy",
  "aidc-blog-reading-path": "strategy",
  "fyh-bigdata-production-forecast": "bigdata",
};

const TITLE_MIGRATIONS = {
  "aidc-work-system-architecture": {
    title: "AIDC.work 系統架構",
    from: ["aidc-work-system-architecture"],
  },
  "taiwan-ai-strategic-blueprint": {
    title: "台灣 AI 戰略藍圖",
    from: ["Taiwan_AI_Strategic_Blueprint", "taiwan-ai-strategic-blueprint"],
  },
};

export function isValidCategoryId(id) {
  return typeof id === "string" && DECK_ID_RE.test(id) && id.length <= 40;
}

export function isLegacyHiddenDeck(deckId) {
  return deckId === "deck" || deckId.startsWith("test-") || deckId.startsWith("fyhgoogle-");
}

function defaultRegistry() {
  return { version: 2, categories: SEED_CATEGORIES.map((item) => ({ ...item })), decks: [] };
}

function blankCatalog(deck) {
  return {
    categoryId: deck?.categoryId || "",
    listed: typeof deck?.listed === "boolean" ? deck.listed : false,
    sortOrder: Number.isFinite(Number(deck?.sortOrder)) ? Number(deck.sortOrder) : 0,
    summary: deck?.summary || "",
  };
}

function normalizeCategory(input, fallback = {}) {
  return {
    id: input.id || fallback.id,
    name: String(input.name ?? fallback.name ?? "").trim(),
    description: String(input.description ?? fallback.description ?? ""),
    sortOrder: Number.isFinite(Number(input.sortOrder ?? fallback.sortOrder))
      ? Number(input.sortOrder ?? fallback.sortOrder)
      : 0,
    isActive: (input.isActive ?? fallback.isActive) !== false,
  };
}

function parseSortOrder(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new CatalogError("排序必須是數字");
  return Math.round(n);
}

export function migrateRegistry(input) {
  const registry = input && typeof input === "object" ? structuredClone(input) : defaultRegistry();
  if (!Array.isArray(registry.decks)) registry.decks = [];
  const upgrading = Number(registry.version) < 2 || !Array.isArray(registry.categories);

  if (!Array.isArray(registry.categories)) {
    registry.categories = SEED_CATEGORIES.map((item) => ({ ...item }));
  } else if (upgrading) {
    for (const seed of SEED_CATEGORIES) {
      if (!registry.categories.some((item) => item.id === seed.id)) {
        registry.categories.push({ ...seed });
      }
    }
  }

  registry.categories = registry.categories.map((item) => normalizeCategory(item));

  for (const deck of registry.decks) {
    if (upgrading) {
      if (!deck.categoryId) {
        if (DECK_CATEGORY[deck.deckId]) deck.categoryId = DECK_CATEGORY[deck.deckId];
        else if (isLegacyHiddenDeck(deck.deckId)) deck.categoryId = "internal";
      }
      if (typeof deck.listed !== "boolean") deck.listed = !isLegacyHiddenDeck(deck.deckId);
      const titleRule = TITLE_MIGRATIONS[deck.deckId];
      if (titleRule && titleRule.from.includes(deck.title)) deck.title = titleRule.title;
    }
    const catalog = blankCatalog(deck);
    deck.categoryId = catalog.categoryId;
    deck.listed = catalog.listed;
    deck.sortOrder = catalog.sortOrder;
    deck.summary = catalog.summary;
  }

  registry.version = 2;
  return registry;
}

function readRegistryFile() {
  if (!fs.existsSync(REGISTRY_PATH)) return defaultRegistry();
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    return defaultRegistry();
  }
}

function syncTitleFile(deckId, title) {
  const mPath = manifestPath(deckId);
  if (fs.existsSync(mPath)) {
    const manifest = readManifest(mPath);
    if (manifest && manifest.title !== title) {
      manifest.title = title;
      fs.writeFileSync(mPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
  }
  const slidesPath = slidesJsonPath(deckId);
  if (fs.existsSync(slidesPath)) {
    const data = JSON.parse(fs.readFileSync(slidesPath, "utf8"));
    if (data.title !== title) {
      data.title = title;
      fs.writeFileSync(slidesPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }
  }
}

export function readRegistry() {
  const parsed = readRegistryFile();
  const migrated = migrateRegistry(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
    const previous = Array.isArray(parsed.decks) ? parsed.decks : [];
    for (const deck of migrated.decks) {
      const before = previous.find((item) => item.deckId === deck.deckId);
      if (before && before.title !== deck.title) syncTitleFile(deck.deckId, deck.title);
    }
    writeRegistry(migrated);
  }
  return migrated;
}

export function writeRegistry(registry) {
  fs.mkdirSync(DECKS_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export function applyUpsertEntry(registry, entry) {
  const next = migrateRegistry(registry);
  const idx = next.decks.findIndex((item) => item.deckId === entry.deckId);
  const prev = idx >= 0 ? next.decks[idx] : null;
  const has = (key) => Object.prototype.hasOwnProperty.call(entry, key) && entry[key] !== undefined;
  const row = {
    ...(prev || {}),
    deckId: entry.deckId,
    title: entry.title || prev?.title || entry.deckId,
    sourceType: entry.sourceType || prev?.sourceType || "html",
    categoryId: has("categoryId") ? String(entry.categoryId || "") : prev?.categoryId || "",
    listed: has("listed") ? Boolean(entry.listed) : prev?.listed === true,
    sortOrder: has("sortOrder") ? parseSortOrder(entry.sortOrder) : Number(prev?.sortOrder) || 0,
    summary: has("summary") ? String(entry.summary || "") : prev?.summary || "",
    createdAt: prev?.createdAt || entry.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (row.categoryId && !next.categories.some((item) => item.id === row.categoryId)) {
    throw new CatalogError("分類不存在");
  }
  if (idx >= 0) next.decks[idx] = row;
  else next.decks.push(row);
  return next;
}

export function upsertRegistryEntry(entry) {
  const registry = applyUpsertEntry(readRegistry(), entry);
  writeRegistry(registry);
  return registry.decks.find((item) => item.deckId === entry.deckId);
}

function categoryName(registry, categoryId) {
  if (!categoryId) return "未分類";
  return registry.categories.find((item) => item.id === categoryId)?.name || categoryId;
}

function summarizeDeck(deckId) {
  const mPath = manifestPath(deckId);
  const htmlPath = deckHtmlPath(deckId);
  const manifest = fs.existsSync(mPath) ? readManifest(mPath) : null;
  const registry = readRegistry();
  const reg = registry.decks.find((item) => item.deckId === deckId) || {};

  const slides = manifest?.slides || [];
  const withScript = slides.filter((item) => item.script).length;
  const audioReady = slides.filter((item) => item.status === "audio_ready").length;
  const stale = slides.filter((item) => item.status === "stale").length;
  const catalog = blankCatalog(reg);

  return {
    deckId,
    title: manifest?.title || reg.title || deckId,
    sourceType: manifest?.sourceType || reg.sourceType || "html",
    slideCount: slides.length,
    scriptsReady: withScript,
    audioReady,
    staleCount: stale,
    hasHtml: fs.existsSync(htmlPath),
    publishedAt: manifest?.meta?.publishedAt || null,
    publishedUrl: manifest?.meta?.publishedUrl || null,
    updatedAt: reg.updatedAt || manifest?.meta?.lastExtractedAt || null,
    categoryId: catalog.categoryId,
    categoryName: categoryName(registry, catalog.categoryId),
    listed: catalog.listed,
    sortOrder: catalog.sortOrder,
    summary: catalog.summary,
    statusChips: buildChips({ slides, withScript, audioReady, stale, publishedAt: manifest?.meta?.publishedAt }),
  };
}

function buildChips({ slides, withScript, audioReady, stale, publishedAt }) {
  const chips = ["已上傳"];
  if (withScript > 0) chips.push("有講稿");
  if (audioReady > 0 && audioReady < slides.length) chips.push("部分語音");
  if (audioReady > 0 && audioReady === slides.length && slides.length > 0) chips.push("全份語音");
  if (stale > 0) chips.push("語音過期");
  if (publishedAt) chips.push("已發布");
  return chips;
}

/** Discover decks from registry + narration manifests + html files. */
export function listDecks() {
  const ids = new Set();
  const registry = readRegistry();
  for (const deck of registry.decks) ids.add(deck.deckId);

  if (fs.existsSync(NARRATION_DIR)) {
    for (const name of fs.readdirSync(NARRATION_DIR)) {
      if (!name.endsWith(".json") || name === "schema.json") continue;
      const id = name.replace(/\.json$/, "");
      if (isValidDeckId(id)) ids.add(id);
    }
  }

  if (fs.existsSync(PRESENTATIONS_DIR)) {
    for (const name of fs.readdirSync(PRESENTATIONS_DIR)) {
      if (!name.endsWith(".html") || name === "index.html") continue;
      const id = name.replace(/\.html$/, "");
      if (isValidDeckId(id)) ids.add(id);
    }
  }

  if (ids.has("enterprise-ai-portal-deck")) {
    upsertRegistryEntry({
      deckId: "enterprise-ai-portal-deck",
      title: "企業 AI 入口網整合平台架構",
      sourceType: "html",
    });
  }

  return [...ids].sort().map(summarizeDeck);
}

export function getDeckSummary(deckId) {
  if (!isValidDeckId(deckId)) return null;
  if (!fs.existsSync(manifestPath(deckId)) && !fs.existsSync(deckHtmlPath(deckId))) return null;
  return summarizeDeck(deckId);
}

export function ensureDeckDirs() {
  fs.mkdirSync(DECKS_DIR, { recursive: true });
  fs.mkdirSync(NARRATION_DIR, { recursive: true });
}

export function applyDeckCatalog(registry, deckId, patch) {
  const next = migrateRegistry(registry);
  let deck = next.decks.find((item) => item.deckId === deckId);
  if (!deck) {
    deck = {
      deckId,
      title: deckId,
      sourceType: "html",
      createdAt: new Date().toISOString(),
      categoryId: "",
      listed: false,
      sortOrder: 0,
      summary: "",
    };
    next.decks.push(deck);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "title")) {
    const title = String(patch.title || "").trim();
    if (!title) throw new CatalogError("標題不可為空");
    deck.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "categoryId")) {
    const categoryId = String(patch.categoryId || "");
    if (categoryId && !next.categories.some((item) => item.id === categoryId)) {
      throw new CatalogError("分類不存在");
    }
    deck.categoryId = categoryId;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "listed")) deck.listed = Boolean(patch.listed);
  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) deck.sortOrder = parseSortOrder(patch.sortOrder);
  if (Object.prototype.hasOwnProperty.call(patch, "summary")) deck.summary = String(patch.summary || "").trim();
  if (Object.prototype.hasOwnProperty.call(patch, "sourceType") && patch.sourceType) {
    deck.sourceType = patch.sourceType;
  }
  deck.updatedAt = new Date().toISOString();
  return { registry: next, deck };
}

export function updateDeckCatalog(deckId, patch) {
  if (!isValidDeckId(deckId)) throw new CatalogError("deckId 格式無效");
  const { registry, deck } = applyDeckCatalog(readRegistry(), deckId, patch);
  if (Object.prototype.hasOwnProperty.call(patch, "title")) syncTitleFile(deckId, deck.title);
  writeRegistry(registry);
  return summarizeDeck(deckId);
}

export function updateDeckTitle(deckId, title) {
  return updateDeckCatalog(deckId, { title });
}

export function listCategories() {
  const registry = readRegistry();
  return registry.categories
    .map((category) => ({
      ...category,
      deckCount: registry.decks.filter((deck) => deck.categoryId === category.id).length,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant"));
}

export function applyCreateCategory(registry, input) {
  const next = migrateRegistry(registry);
  const id = String(input?.id || "").trim().toLowerCase();
  const name = String(input?.name || "").trim();
  if (!name) throw new CatalogError("分類名稱不可為空");
  if (!isValidCategoryId(id)) throw new CatalogError("分類代碼格式無效（僅 a-z、0-9 與連字號）");
  if (next.categories.some((item) => item.id === id)) throw new CatalogError("分類代碼已存在", 409);
  const category = {
    id,
    name,
    description: String(input?.description || "").trim(),
    sortOrder:
      input?.sortOrder == null || input?.sortOrder === ""
        ? (next.categories.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0) + 10)
        : parseSortOrder(input.sortOrder),
    isActive: !(input?.isActive === false || input?.isActive === "false" || input?.isActive === "0"),
  };
  next.categories.push(category);
  return { registry: next, category };
}

export function createCategory(input) {
  const { registry, category } = applyCreateCategory(readRegistry(), input);
  writeRegistry(registry);
  return { ...category, deckCount: 0 };
}

export function applyUpdateCategory(registry, id, input) {
  const next = migrateRegistry(registry);
  const idx = next.categories.findIndex((item) => item.id === id);
  if (idx < 0) throw new CatalogError("找不到分類", 404);
  const current = next.categories[idx];
  const name = input?.name != null ? String(input.name).trim() : current.name;
  if (!name) throw new CatalogError("分類名稱不可為空");
  const newId = input?.id != null ? String(input.id).trim().toLowerCase() : current.id;
  if (!isValidCategoryId(newId)) throw new CatalogError("分類代碼格式無效（僅 a-z、0-9 與連字號）");
  if (newId !== current.id && next.categories.some((item) => item.id === newId)) {
    throw new CatalogError("分類代碼已存在", 409);
  }
  const updated = {
    ...current,
    id: newId,
    name,
    description: input?.description != null ? String(input.description).trim() : current.description || "",
    sortOrder:
      input?.sortOrder != null && input?.sortOrder !== "" ? parseSortOrder(input.sortOrder) : current.sortOrder,
    isActive:
      input?.isActive == null
        ? current.isActive !== false
        : !(input.isActive === false || input.isActive === "false" || input.isActive === "0"),
  };
  next.categories[idx] = updated;
  if (newId !== current.id) {
    for (const deck of next.decks) {
      if (deck.categoryId === current.id) deck.categoryId = newId;
    }
  }
  return { registry: next, category: updated };
}

export function updateCategory(id, input) {
  const { registry, category } = applyUpdateCategory(readRegistry(), id, input);
  writeRegistry(registry);
  const deckCount = registry.decks.filter((deck) => deck.categoryId === category.id).length;
  return { ...category, deckCount };
}

export function applyDeleteCategory(registry, id, options = {}) {
  const next = migrateRegistry(registry);
  const idx = next.categories.findIndex((item) => item.id === id);
  if (idx < 0) throw new CatalogError("找不到分類", 404);
  const used = next.decks.filter((deck) => deck.categoryId === id);
  const hasReassign = Object.prototype.hasOwnProperty.call(options, "reassignTo");
  if (used.length && !hasReassign) {
    throw new CatalogError(`仍有 ${used.length} 份簡報使用此分類，請先改派後再刪除`, 409, {
      deckCount: used.length,
    });
  }
  if (hasReassign) {
    const target = String(options.reassignTo || "");
    if (target === id) throw new CatalogError("不能改派到正在刪除的分類");
    if (target && !next.categories.some((item) => item.id === target)) throw new CatalogError("改派的分類不存在");
    for (const deck of used) deck.categoryId = target;
  }
  next.categories.splice(idx, 1);
  return { registry: next, deleted: true };
}

export function deleteCategory(id, options = {}) {
  const { registry } = applyDeleteCategory(readRegistry(), id, options);
  writeRegistry(registry);
  return { id, deleted: true };
}

function rmRecursive(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

/** Remove local deck assets (does not unpublish Cloudflare). */
export function deleteDeck(deckId) {
  if (!isValidDeckId(deckId)) throw new CatalogError("deckId 格式無效");

  const htmlPath = deckHtmlPath(deckId);
  const mPath = manifestPath(deckId);
  const slidesPath = slidesJsonPath(deckId);
  const pagesDir = path.join(PRESENTATIONS_DIR, deckId);
  const audioDir = path.join(NARRATION_DIR, "audio", deckId);

  if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
  if (fs.existsSync(mPath)) fs.unlinkSync(mPath);
  if (fs.existsSync(slidesPath)) fs.unlinkSync(slidesPath);
  rmRecursive(pagesDir);
  rmRecursive(audioDir);

  const registry = readRegistry();
  registry.decks = registry.decks.filter((item) => item.deckId !== deckId);
  writeRegistry(registry);

  return { deckId, deleted: true };
}

export function catalogPatchFromBody(body = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "categoryId")) patch.categoryId = String(body.categoryId || "");
  if (body.listed === true || body.listed === "1" || body.listed === "true" || body.listed === "on") patch.listed = true;
  else if (body.listed === false || body.listed === "0" || body.listed === "false") patch.listed = false;
  if (body.sortOrder !== undefined && body.sortOrder !== "") patch.sortOrder = body.sortOrder;
  if (Object.prototype.hasOwnProperty.call(body, "summary")) patch.summary = body.summary;
  return patch;
}
