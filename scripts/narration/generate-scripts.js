#!/usr/bin/env node
import "dotenv/config";
import {
  applyGeneratedScript,
  buildGenerationContext,
  readManifest,
  writeManifest,
  recalcManifestMeta,
} from "./lib/manifest.js";
import fs from "node:fs";
import { generateScriptWithLlm } from "./lib/llm.js";
import { manifestPath, resolveDeckId, slidesJsonPath } from "./lib/paths.js";
import { readSlidesJson } from "./lib/slide-model.js";
import { loadAndValidateManifest } from "./lib/validate.js";

const args = process.argv.slice(2);
const onlyStale = args.includes("--stale-only");
const onlyEmpty = args.includes("--empty-only");
const slideFilter = args.find((a) => a.startsWith("--slide="))?.split("=")[1];
const force = args.includes("--force");

const deckId = resolveDeckId(process.argv.slice(2));
const narrationPath = manifestPath(deckId);
let { manifest } = loadAndValidateManifest(narrationPath);
const slidesPath = slidesJsonPath(manifest.deckId || deckId);
const deckTitle = fs.existsSync(slidesPath) ? readSlidesJson(slidesPath).title : manifest.deckId;

let generated = 0;
for (let i = 0; i < manifest.slides.length; i++) {
  const slide = manifest.slides[i];
  if (slideFilter && slide.slideId !== slideFilter) continue;

  const shouldGenerate =
    force ||
    slide.status === "empty" ||
    slide.status === "stale" ||
    (onlyStale && slide.status === "stale") ||
    (onlyEmpty && slide.status === "empty") ||
    (!onlyStale && !onlyEmpty && !slideFilter && ["empty", "stale"].includes(slide.status));

  if (!shouldGenerate && !slideFilter) continue;
  if (slideFilter && !force && slide.status === "approved") {
    console.log(`跳過 ${slide.slideId}（已 approved，使用 --force 覆寫）`);
    continue;
  }

  const context = buildGenerationContext(manifest, i, { deckTitle });
  console.log(`生成講稿 ${slide.slideId} — ${slide.title}...`);

  const result = await generateScriptWithLlm(slide, context);
  applyGeneratedScript(slide, result);
  if (result.modelVersion && !result.modelVersion.startsWith("template")) {
    manifest.modelVersion = result.modelVersion;
  }
  generated++;
}

recalcManifestMeta(manifest);
writeManifest(manifest, narrationPath);

console.log(`✓ 已生成 ${generated} 頁講稿`);
console.log("→ 人工檢視後執行: npm run narration:approve -- --all");
console.log("  或單頁: npm run narration:approve -- --slide=s1");
