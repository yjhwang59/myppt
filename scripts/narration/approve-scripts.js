#!/usr/bin/env node
import "dotenv/config";
import { readManifest, writeManifest } from "./lib/manifest.js";
import { manifestPath, resolveDeckId } from "./lib/paths.js";
import { loadAndValidateManifest } from "./lib/validate.js";

const args = process.argv.slice(2);
const approveAll = args.includes("--all");
const slideId = args.find((a) => a.startsWith("--slide="))?.split("=")[1];
const reviewer = args.find((a) => a.startsWith("--by="))?.split("=")[1] || "reviewer";
const toPending = args.includes("--pending");

if (!approveAll && !slideId && !toPending) {
  console.log(`用法:
  npm run narration:approve -- --slide=s1
  npm run narration:approve -- --all
  npm run narration:approve -- --deck=pccu-1151-bigdata-2026-10-03 --all
  npm run narration:approve -- --slide=s1 --pending
  npm run narration:approve -- --all --by=jack`);
  process.exit(1);
}

const deckId = resolveDeckId(process.argv.slice(2));
const narrationPath = manifestPath(deckId);
const { manifest } = loadAndValidateManifest(narrationPath);
let updated = 0;

for (const slide of manifest.slides) {
  if (!approveAll && slide.slideId !== slideId) continue;
  if (!slide.script) {
    console.warn(`跳過 ${slide.slideId}：尚無講稿`);
    continue;
  }

  if (toPending) {
    slide.status = "pending_review";
  } else {
    slide.status = "approved";
    slide.approvedAt = new Date().toISOString();
    slide.approvedBy = reviewer;
  }
  updated++;
}

writeManifest(manifest, narrationPath);
console.log(`✓ 已更新 ${updated} 頁狀態`);
if (!toPending) {
  console.log("→ 執行 TTS: npm run narration:tts");
  console.log("  離線測試: npm run narration:tts -- --dry-run");
}
