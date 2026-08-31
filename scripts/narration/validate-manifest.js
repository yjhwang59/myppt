#!/usr/bin/env node
import { loadAndValidateManifest } from "./lib/validate.js";
import { MANIFEST_PATH } from "./lib/paths.js";
import { estimateManifestTtsCost } from "./lib/tts/index.js";

const { manifest, ok, errors } = loadAndValidateManifest(MANIFEST_PATH);

if (!ok) {
  console.error("✗ manifest 驗證失敗:");
  errors.forEach((e) => console.error("  -", e));
  process.exit(1);
}

const statusCounts = {};
for (const s of manifest.slides) {
  statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
}

console.log(`✓ ${manifest.deckId}: ${manifest.slides.length} 頁`);
console.log("  狀態:", statusCounts);
console.log(`  估計總時長: ${manifest.meta?.totalEstimatedSeconds ?? 0}s`);
console.log(`  TTS 成本估計: $${estimateManifestTtsCost(manifest).toFixed(4)}`);

const missingScript = manifest.slides.filter((s) => !s.script);
if (missingScript.length) {
  console.warn(`⚠ ${missingScript.length} 頁缺少講稿`);
}

process.exit(0);
