#!/usr/bin/env node
import "dotenv/config";
import { extractDeckFromFile } from "./lib/extract.js";
import {
  deckHtmlPath,
  manifestPath,
  resolveDeckId,
} from "./lib/paths.js";
import {
  mergeExtractedSlides,
  readManifest,
  writeManifest,
  recalcManifestMeta,
} from "./lib/manifest.js";
import { loadAndValidateManifest } from "./lib/validate.js";

const deckId = resolveDeckId(process.argv.slice(2));
const deckPath = deckHtmlPath(deckId);
const narrationPath = manifestPath(deckId);
const extracted = extractDeckFromFile(deckPath);
const existing = readManifest(narrationPath);

const manifest = mergeExtractedSlides({
  deckId,
  deckPath: `${deckId}.html`,
  extractedSlides: extracted,
  existingManifest: existing,
});

recalcManifestMeta(manifest);
writeManifest(manifest, narrationPath);

const { ok, errors } = loadAndValidateManifest(narrationPath);
console.log(`✓ 已抽取 ${extracted.length} 頁 → ${narrationPath}`);
if (!ok) {
  console.warn("驗證警告:", errors.join("; "));
} else {
  console.log("✓ manifest schema 驗證通過");
}

const stale = manifest.slides.filter((s) => s.status === "stale").length;
const empty = manifest.slides.filter((s) => s.status === "empty").length;
if (stale) console.log(`⚠ ${stale} 頁標記為 stale（內容已變更）`);
if (empty) console.log(`→ ${empty} 頁待生成講稿，執行 npm run narration:generate`);
