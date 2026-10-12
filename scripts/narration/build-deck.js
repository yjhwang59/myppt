#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deckHtmlPath, resolveDeckId, slidesJsonPath } from "./lib/paths.js";
import { getDeckPolicy } from "./lib/registry.js";
import { assessHtmlRebuild, rebuildDecision } from "./lib/rebuild-safety.js";
import { readSlidesJson } from "./lib/slide-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const skipExtract = argv.includes("--skip-extract");
const deckId = resolveDeckId(argv, { positional: true });
const policy = getDeckPolicy(deckId);
const htmlPath = deckHtmlPath(deckId);
const slidesPath = slidesJsonPath(deckId);

if (!fs.existsSync(htmlPath)) {
  console.error(`HTML shell not found: ${htmlPath}`);
  console.error('Create presentations/<deckId>.html with <main id="deck"> first. This script only patches that region.');
  process.exit(1);
}

if (!fs.existsSync(slidesPath)) {
  console.error(`slides JSON not found: ${slidesPath}`);
  process.exit(1);
}

const deckData = readSlidesJson(slidesPath);
const html = fs.readFileSync(htmlPath, "utf8");
const assessment = assessHtmlRebuild(html, deckData);
const decision = rebuildDecision(policy, assessment);

console.log(`${deckId}: format=${policy.format} pipeline=${policy.pipeline} htmlRebuild=${policy.htmlRebuild}`);
console.log(assessment.summary || decision.reason);
if (policy.note) console.log(policy.note);

if (checkOnly || !decision.write) {
  if (!decision.write) {
    console.error(`refusing to rewrite ${htmlPath}`);
    console.error(decision.reason);
    process.exit(2);
  }
  console.log(`✓ check only; ${htmlPath} unchanged`);
  process.exit(0);
}

if (!assessment.patched) {
  console.error(assessment.summary || "refused to write");
  process.exit(2);
}

fs.writeFileSync(htmlPath, assessment.patched, "utf8");
console.log(`✓ rebuilt ${htmlPath} from ${slidesPath}`);

if (!skipExtract && policy.pipeline === "native") {
  const res = spawnSync(process.execPath, [path.join(__dirname, "extract-slides.js"), `--deck=${deckId}`], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(res.status ?? 0);
}
