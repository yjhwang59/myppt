#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const steps = [
  ["extract-slides.js", []],
  ["generate-scripts.js", []],
  ["approve-scripts.js", ["--all"]],
  ["synthesize-audio.js", process.argv.includes("--dry-run") ? ["--dry-run"] : []],
  ["validate-manifest.js", []],
];

for (const [script, extraArgs] of steps) {
  console.log(`\n=== ${script} ===`);
  const res = spawnSync(node, [path.join(__dirname, script), ...extraArgs], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

console.log("\n✓ narration pipeline 完成");
