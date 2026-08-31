#!/usr/bin/env node
import fs from "node:fs";
import { MANIFEST_PATH, audioRelativeUrl } from "./lib/paths.js";

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
for (const slide of manifest.slides) {
  slide.audioUrl = audioRelativeUrl(slide.slideId);
}
fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`✓ 已更新 ${manifest.slides.length} 筆 audioUrl`);
