#!/usr/bin/env node
import fs from "node:fs";
import { DECK_HTML, DECK_ID, slidesJsonPath } from "./lib/paths.js";
import { migrateDeckHtml, writeSlidesJson } from "./lib/slide-model.js";

const html = fs.readFileSync(DECK_HTML, "utf8");
const deckData = migrateDeckHtml(html, DECK_ID);
const outPath = slidesJsonPath(DECK_ID);
writeSlidesJson(outPath, deckData);
console.log(`✓ migrated ${deckData.slides.length} slides → ${outPath}`);
