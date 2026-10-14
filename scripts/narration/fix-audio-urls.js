#!/usr/bin/env node
import fs from "node:fs";
import { DECK_ID, audioRelativeUrl, manifestPath } from "./lib/paths.js";

const deckId = process.argv[2] || DECK_ID;
const mPath = manifestPath(deckId);
const manifest = JSON.parse(fs.readFileSync(mPath, "utf8"));
for (const slide of manifest.slides) {
  slide.audioUrl = audioRelativeUrl(deckId, slide.slideId);
}
fs.writeFileSync(mPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`✓ 已更新 ${manifest.slides.length} 筆 audioUrl → ${deckId}`);
