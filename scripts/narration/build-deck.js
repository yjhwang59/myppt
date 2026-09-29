#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_ID, deckHtmlPath, slidesJsonPath } from "./lib/paths.js";
import { patchDeckHtml, readSlidesJson } from "./lib/slide-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawArgs = process.argv.slice(2);
const skipExtract = rawArgs.includes("--skip-extract");
const deckId = rawArgs.find((arg) => !arg.startsWith("--")) || DECK_ID;
const slidesPath = slidesJsonPath(deckId);
const deckHtml = deckHtmlPath(deckId);

if (!fs.existsSync(slidesPath)) {
  console.error(`slides json not found: ${slidesPath}`);
  process.exit(1);
}
if (!fs.existsSync(deckHtml)) {
  console.error(`deck html not found: ${deckHtml}`);
  process.exit(1);
}

const deckData = readSlidesJson(slidesPath);
const html = fs.readFileSync(deckHtml, "utf8");
const patched = patchDeckHtml(html, deckData);
fs.writeFileSync(deckHtml, patched, "utf8");
console.log(`✓ rebuilt ${deckHtml} from ${slidesPath}`);

// extract-slides.js is still bound to the original enterprise narration manifest.
if (!skipExtract && deckId === DECK_ID) {
  const res = spawnSync(process.execPath, [path.join(__dirname, "extract-slides.js")], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(res.status ?? 0);
} else if (!skipExtract && deckId !== DECK_ID) {
  console.log(`↪ skip extract-slides for ${deckId} (narration pipeline still bound to ${DECK_ID})`);
}
