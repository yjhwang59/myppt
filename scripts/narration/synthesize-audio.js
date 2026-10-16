#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import "./lib/tts/openai-adapter.js";
import "./lib/tts/elevenlabs-adapter.js";
import "./lib/tts/dry-run-adapter.js";
import {
  ensureAudioDir,
  readManifest,
  writeManifest,
  setSlideAudioReady,
  setSlideAudioFailed,
  recalcManifestMeta,
} from "./lib/manifest.js";
import {
  audioAbsolutePath,
  DECK_ID,
  MANIFEST_PATH,
  manifestPath,
} from "./lib/paths.js";
import {
  getTtsAdapter,
  estimateTtsCostUsd,
  isSlideEligibleForTts,
  resolveNarrationProvider,
} from "./lib/tts/index.js";
import { loadAndValidateManifest } from "./lib/validate.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slideFilter = args.find((a) => a.startsWith("--slide="))?.split("=")[1];
const force = args.includes("--force");
const deckId = args.find((a) => a.startsWith("--deck="))?.split("=")[1] || DECK_ID;

const budgetUsd = Number(process.env.NARRATION_TTS_BUDGET_USD || 5);
const maxRetries = Number(process.env.NARRATION_TTS_MAX_RETRIES || 2);

const mPath = manifestPath(deckId);
const { manifest } = loadAndValidateManifest(mPath);
ensureAudioDir(deckId);

const adapters = new Map();
async function adapterFor(name) {
  if (!adapters.has(name)) adapters.set(name, await getTtsAdapter(name));
  return adapters.get(name);
}

const eligible = manifest.slides.filter((s) => isSlideEligibleForTts(s, { force, slideFilter }));

if (!eligible.length) {
  console.log("沒有符合條件的頁面。請先 approve 講稿，已有音訊請加 --force，或使用 --slide=sN");
  process.exit(0);
}

let spent = manifest.meta?.ttsCostEstimateUsd || 0;
let success = 0;
let failed = 0;

for (const slide of eligible) {
  const provider = resolveNarrationProvider({ dryRun, slide, manifest });
  const pricedProvider = provider === "dry-run"
    ? (slide.voice?.provider || manifest.voice?.provider || "openai")
    : provider;
  const est = estimateTtsCostUsd(slide.script, pricedProvider);
  if (!dryRun && spent + est > budgetUsd) {
    console.warn(`⚠ 已達 TTS 預算上限 $${budgetUsd}，停止於 ${slide.slideId}`);
    break;
  }

  const outPath = audioAbsolutePath(deckId, slide.slideId);
  const voice = slide.voice || manifest.voice || {};
  const adapter = await adapterFor(provider);
  console.log(`TTS ${slide.slideId} → ${outPath} (${provider})`);

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await adapter.synthesize({
        text: slide.script,
        voiceId: voice.voiceId,
        speed: voice.speed ?? 1.0,
        outputPath: outPath,
      });
      setSlideAudioReady(slide, result.durationSeconds, deckId);
      spent += result.costUsd;
      success++;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }

  if (lastErr) {
    setSlideAudioFailed(slide, lastErr.message || String(lastErr));
    failed++;
    console.error(`✗ ${slide.slideId}: ${lastErr.message || lastErr}`);
  } else if (dryRun) {
    console.log(`  (dry-run 估計 ${slide.audioDurationSeconds}s)`);
  }
}

manifest.meta = manifest.meta || {};
manifest.meta.ttsCostEstimateUsd = Number(spent.toFixed(4));
recalcManifestMeta(manifest);
writeManifest(manifest);

console.log(`✓ TTS 完成: 成功 ${success}, 失敗 ${failed}, 累計成本約 $${manifest.meta.ttsCostEstimateUsd}`);
if (dryRun) {
  console.log("注意: dry-run 產物非真實 MP3，播放器會顯示講稿但可能無法播放音訊。");
}
