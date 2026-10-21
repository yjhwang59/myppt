#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_HTML, DECK_ID, deckHtmlPath, slidesJsonPath } from "./lib/paths.js";
import { patchDeckHtml, readSlidesJson, roundTripMismatches } from "./lib/slide-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawArgs = process.argv.slice(2);
const check = rawArgs.includes("--check");
const args = rawArgs.filter((arg) => arg !== "--skip-extract" && arg !== "--check");
const deckId = args.find((arg) => !arg.startsWith("--")) || DECK_ID;
const htmlPath = deckHtmlPath(deckId);
const resolvedHtml = path.resolve(htmlPath);
const resolvedEnterprise = path.resolve(DECK_HTML);

if (resolvedHtml === resolvedEnterprise && deckId !== DECK_ID) {
  console.error(`refusing to rewrite enterprise deck for id ${deckId}`);
  process.exit(1);
}

if (!fs.existsSync(htmlPath)) {
  console.error(`HTML shell not found: ${htmlPath}`);
  console.error("Create presentations/<deckId>.html with <main id=\"deck\"> first. This script only patches that region.");
  process.exit(1);
}

const slidesPath = slidesJsonPath(deckId);
if (!fs.existsSync(slidesPath)) {
  console.error(`slides JSON not found: ${slidesPath}`);
  process.exit(1);
}

const deckData = readSlidesJson(slidesPath);
const html = fs.readFileSync(htmlPath, "utf8");
if (!/<main id="deck">[\s\S]*?<\/main>/.test(html)) {
  console.error(`no <main id="deck"> in ${htmlPath}; refused to write`);
  process.exit(1);
}
const patched = patchDeckHtml(html, deckData);

if (check) {
  const mismatches = roundTripMismatches(deckData);
  const htmlDrift = patched !== html;
  if (mismatches.length || htmlDrift) {
    console.error(`✗ round-trip check failed for ${deckId}`);
    if (htmlDrift) console.error("  - HTML <main id=\"deck\"> 與 slides.json 渲染結果不一致");
    for (const mismatch of mismatches) {
      console.error(`  - ${mismatch.slideId} 往返後欄位不一致`);
      console.error(JSON.stringify(mismatch, null, 2));
    }
    process.exit(1);
  }
  console.log(`✓ round-trip check passed for ${deckId}`);
  process.exit(0);
}

fs.writeFileSync(htmlPath, patched, "utf8");
console.log(`✓ rebuilt ${htmlPath} from ${slidesPath}`);

// extract-slides.js always rewrites the enterprise narration manifest.
if (deckId === DECK_ID && !process.argv.includes("--skip-extract")) {
  const res = spawnSync(process.execPath, [path.join(__dirname, "extract-slides.js")], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(res.status ?? 0);
}
