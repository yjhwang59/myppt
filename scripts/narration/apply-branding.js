#!/usr/bin/env node
/**
 * Rewrite hand-authored and gated deck chrome to the shared role.
 * Does not call build:deck or patch <main>.
 */
import fs from "node:fs";
import path from "node:path";
import { loadBranding, normalizeBrand } from "./lib/branding.js";
import { PRESENTATIONS_DIR } from "./lib/paths.js";
import { readRegistry } from "./lib/registry.js";

const branding = loadBranding();
const pdfIds = new Set(
  (readRegistry().decks || [])
    .filter((deck) => deck.sourceType === "pdf" || deck.format === "pdf")
    .map((deck) => deck.deckId)
);

const exactReplacements = [];
for (const value of branding.collapseExact || []) {
  const next = normalizeBrand(value);
  if (next !== value) exactReplacements.push([value, next]);
}
for (const name of branding.names || []) {
  const next = normalizeBrand(name);
  if (next !== name) exactReplacements.push([name, next]);
}
exactReplacements.sort((a, b) => b[0].length - a[0].length);

function isPdfFile(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const deckId = base.endsWith(".slides") ? base.slice(0, -".slides".length) : base;
  return pdfIds.has(deckId);
}

function applyText(text) {
  let next = text;
  if (branding.legacyTitle) next = next.replaceAll(branding.legacyTitle, branding.role);
  for (const [from, to] of exactReplacements) {
    next = next.replaceAll(`>${from}</`, `>${to}</`);
    next = next.replaceAll(`"footerBrand": "${from}"`, `"footerBrand": "${to}"`);
  }
  return next;
}

const targets = [];
for (const entry of fs.readdirSync(PRESENTATIONS_DIR, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith(".html") && !entry.name.endsWith(".md")) continue;
  if (entry.name === "index.html" || entry.name === "branding.json") continue;
  const filePath = path.join(PRESENTATIONS_DIR, entry.name);
  if (isPdfFile(filePath)) continue;
  targets.push(filePath);
}
targets.push(path.join(PRESENTATIONS_DIR, "narration/pccu-1151-bigdata-2026-10-03.md"));
targets.push(path.join(PRESENTATIONS_DIR, "narration/pccu-1151-bigdata-2026-10-03.json"));

for (const file of fs.readdirSync(path.join(PRESENTATIONS_DIR, "decks"))) {
  if (!file.endsWith(".slides.json")) continue;
  const filePath = path.join(PRESENTATIONS_DIR, "decks", file);
  if (isPdfFile(filePath)) continue;
  targets.push(filePath);
}

let changed = 0;
for (const filePath of targets) {
  if (!fs.existsSync(filePath)) continue;
  const before = fs.readFileSync(filePath, "utf8");
  const after = applyText(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    changed += 1;
    console.log(path.relative(PRESENTATIONS_DIR, filePath));
  }
}
console.log(`updated ${changed} files; role=${branding.role}`);
