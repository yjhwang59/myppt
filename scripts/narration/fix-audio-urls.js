#!/usr/bin/env node
import fs from "node:fs";
import { audioRelativeUrl, manifestPath, resolveDeckId } from "./lib/paths.js";

const deckId = resolveDeckId(process.argv.slice(2));
const narrationPath = manifestPath(deckId);
const manifest = JSON.parse(fs.readFileSync(narrationPath, "utf8"));
const id = manifest.deckId || deckId;
for (const slide of manifest.slides) {
  if (!slide.audioUrl && slide.status !== "audio_ready") continue;
  slide.audioUrl = audioRelativeUrl(slide.slideId, id);
}
fs.writeFileSync(narrationPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`✓ 已更新 ${manifest.slides.filter((slide) => slide.audioUrl).length} 筆 audioUrl → ${narrationPath}`);
