#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK_HTML, DECK_ID, slidesJsonPath } from "./lib/paths.js";
import { patchDeckHtml, readSlidesJson } from "./lib/slide-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deckId = process.argv[2] || DECK_ID;
const slidesPath = slidesJsonPath(deckId);
const deckData = readSlidesJson(slidesPath);
const html = fs.readFileSync(DECK_HTML, "utf8");
const patched = patchDeckHtml(html, deckData);
fs.writeFileSync(DECK_HTML, patched, "utf8");
console.log(`✓ rebuilt ${DECK_HTML} from ${slidesPath}`);

if (!process.argv.includes("--skip-extract")) {
  const res = spawnSync(process.execPath, [path.join(__dirname, "extract-slides.js")], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(res.status ?? 0);
}
