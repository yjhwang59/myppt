#!/usr/bin/env node
/**
 * One-time: move narration/audio/sNN.mp3 → narration/audio/{deckId}/sNN.mp3
 * and rewrite manifest audioUrl fields.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AUDIO_DIR,
  DECK_ID,
  MANIFEST_PATH,
  audioRelativeUrl,
  deckAudioDir,
  manifestPath,
} from "./lib/paths.js";

function migrateDeck(deckId) {
  const mPath = manifestPath(deckId);
  if (!fs.existsSync(mPath)) {
    console.log(`skip ${deckId}: no manifest`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(mPath, "utf8"));
  const destDir = deckAudioDir(deckId);
  fs.mkdirSync(destDir, { recursive: true });

  let moved = 0;
  for (const slide of manifest.slides) {
    const fileName = `s${String(slide.slideId).replace(/^s/, "").padStart(2, "0")}.mp3`;
    const legacyFlat = path.join(AUDIO_DIR, fileName);
    const dest = path.join(destDir, fileName);
    const newUrl = audioRelativeUrl(deckId, slide.slideId);

    if (fs.existsSync(legacyFlat) && !fs.existsSync(dest)) {
      fs.renameSync(legacyFlat, dest);
      moved++;
    } else if (fs.existsSync(path.join(AUDIO_DIR, deckId, fileName)) === false && fs.existsSync(legacyFlat)) {
      fs.copyFileSync(legacyFlat, dest);
      moved++;
    }

    if (slide.audioUrl && !String(slide.audioUrl).includes(`/${deckId}/`)) {
      slide.audioUrl = newUrl;
    } else if (slide.status === "audio_ready" || slide.audioUrl) {
      slide.audioUrl = newUrl;
    }
  }

  if (!manifest.title) manifest.title = deckId;
  if (!manifest.sourceType) manifest.sourceType = "html";
  fs.writeFileSync(mPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`✓ ${deckId}: moved ${moved} files, updated audioUrl`);
}

migrateDeck(process.argv[2] || DECK_ID);
