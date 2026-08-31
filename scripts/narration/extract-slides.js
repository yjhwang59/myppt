#!/usr/bin/env node
import "dotenv/config";
import { extractDeckFromFile } from "./lib/extract.js";
import {
  DECK_HTML,
  DECK_ID,
  MANIFEST_PATH,
} from "./lib/paths.js";
import {
  mergeExtractedSlides,
  readManifest,
  writeManifest,
  recalcManifestMeta,
} from "./lib/manifest.js";
import { loadAndValidateManifest } from "./lib/validate.js";

const deckPath = process.argv[2] || DECK_HTML;
const extracted = extractDeckFromFile(deckPath);
const existing = readManifest();

const manifest = mergeExtractedSlides({
  deckId: DECK_ID,
  deckPath: "enterprise-ai-portal-deck.html",
  extractedSlides: extracted,
  existingManifest: existing,
});

recalcManifestMeta(manifest);
writeManifest(manifest);

const { ok, errors } = loadAndValidateManifest(MANIFEST_PATH);
console.log(`✓ 已抽取 ${extracted.length} 頁 → ${MANIFEST_PATH}`);
if (!ok) {
  console.warn("驗證警告:", errors.join("; "));
} else {
  console.log("✓ manifest schema 驗證通過");
}

const stale = manifest.slides.filter((s) => s.status === "stale").length;
const empty = manifest.slides.filter((s) => s.status === "empty").length;
if (stale) console.log(`⚠ ${stale} 頁標記為 stale（內容已變更）`);
if (empty) console.log(`→ ${empty} 頁待生成講稿，執行 npm run narration:generate`);
