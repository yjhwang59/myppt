import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import express from "express";
import cors from "cors";
import {
  DECK_ID,
  DECK_HTML,
  MANIFEST_PATH,
  PRESENTATIONS_DIR,
  REPO_ROOT,
  slidesJsonPath,
  audioAbsolutePath,
  audioRelativeUrl,
} from "../scripts/narration/lib/paths.js";
import { readSlidesJson, writeSlidesJson, patchDeckHtml } from "../scripts/narration/lib/slide-model.js";
import { readManifest, writeManifest, setSlideAudioReady, setSlideAudioFailed, recalcManifestMeta } from "../scripts/narration/lib/manifest.js";
import { generateScriptWithLlm } from "../scripts/narration/lib/llm.js";
import { buildGenerationContext } from "../scripts/narration/lib/manifest.js";
import { estimateSecondsFromScript } from "../scripts/narration/lib/extract.js";
import { mergeExtractedSlides } from "../scripts/narration/lib/manifest.js";
import { extractDeckFromFile } from "../scripts/narration/lib/extract.js";
import { ALL_VOICES, resolveVoiceId, genderFromVoiceId } from "./lib/voices.js";
import "../scripts/narration/lib/tts/openai-adapter.js";
import { getTtsAdapter } from "../scripts/narration/lib/tts/index.js";

const PORT = Number(process.env.ADMIN_PORT || 8787);
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret-change-me";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-admin-secret"];
  if (!token || token !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function getDeckPaths(deckId) {
  return {
    slidesPath: slidesJsonPath(deckId),
    manifestPath: MANIFEST_PATH,
    deckHtml: DECK_HTML,
  };
}

function loadCombinedSlide(deckId, slideId) {
  const { slidesPath, manifestPath } = getDeckPaths(deckId);
  const deckData = readSlidesJson(slidesPath);
  const slide = deckData.slides.find((s) => s.slideId === slideId);
  if (!slide) return null;
  const manifest = readManifest(manifestPath);
  const narration = manifest?.slides?.find((s) => s.slideId === slideId) || null;
  return { deckData, slide, manifest, narration };
}

function rebuildDeck(deckId) {
  const { slidesPath, deckHtml, manifestPath } = getDeckPaths(deckId);
  const deckData = readSlidesJson(slidesPath);
  const html = fs.readFileSync(deckHtml, "utf8");
  fs.writeFileSync(deckHtml, patchDeckHtml(html, deckData), "utf8");

  const extracted = extractDeckFromFile(deckHtml);
  const existing = readManifest(manifestPath);
  const manifest = mergeExtractedSlides({
    deckId,
    deckPath: path.basename(deckHtml),
    extractedSlides: extracted,
    existingManifest: existing,
  });
  recalcManifestMeta(manifest);
  writeManifest(manifest, manifestPath);
  return manifest;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, deckId: DECK_ID });
});

app.get("/api/voices", auth, (_req, res) => {
  res.json({ voices: ALL_VOICES });
});

app.get("/api/decks/:deckId/slides", auth, (req, res) => {
  const deckId = req.params.deckId;
  const { slidesPath, manifestPath } = getDeckPaths(deckId);
  if (!fs.existsSync(slidesPath)) return res.status(404).json({ error: "slides.json not found" });
  const deckData = readSlidesJson(slidesPath);
  const manifest = readManifest(manifestPath);
  const rows = deckData.slides.map((slide) => {
    const narration = manifest?.slides?.find((s) => s.slideId === slide.slideId);
    return {
      ...slide,
      script: narration?.script || "",
      status: narration?.status || "empty",
      audioUrl: narration?.audioUrl || null,
      voice: narration?.voice || manifest?.voice,
      estimatedSeconds: narration?.estimatedSeconds,
    };
  });
  res.json({ deckId, title: deckData.title, slides: rows, voice: manifest?.voice });
});

app.get("/api/decks/:deckId/slides/:slideId", auth, (req, res) => {
  const combined = loadCombinedSlide(req.params.deckId, req.params.slideId);
  if (!combined) return res.status(404).json({ error: "slide not found" });
  const { slide, narration, manifest } = combined;
  res.json({
    slide,
    narration,
    voice: narration?.voice || manifest?.voice,
    gender: genderFromVoiceId(narration?.voice?.voiceId || manifest?.voice?.voiceId),
  });
});

app.put("/api/decks/:deckId/slides/:slideId", auth, (req, res) => {
  const { deckId, slideId } = req.params;
  const { slidesPath } = getDeckPaths(deckId);
  const deckData = readSlidesJson(slidesPath);
  const idx = deckData.slides.findIndex((s) => s.slideId === slideId);
  if (idx < 0) return res.status(404).json({ error: "slide not found" });

  const incoming = req.body || {};
  deckData.slides[idx] = {
    ...deckData.slides[idx],
    title: incoming.title ?? deckData.slides[idx].title,
    eyebrow: incoming.eyebrow ?? deckData.slides[idx].eyebrow,
    kicker: incoming.kicker ?? deckData.slides[idx].kicker,
    h1: incoming.h1 ?? deckData.slides[idx].h1,
    h2: incoming.h2 ?? deckData.slides[idx].h2,
    lead: incoming.lead ?? deckData.slides[idx].lead,
    stamp: incoming.stamp ?? deckData.slides[idx].stamp,
    cards: incoming.cards ?? deckData.slides[idx].cards,
    flowSteps: incoming.flowSteps ?? deckData.slides[idx].flowSteps,
    table: incoming.table ?? deckData.slides[idx].table,
    callouts: incoming.callouts ?? deckData.slides[idx].callouts,
  };
  writeSlidesJson(slidesPath, deckData);
  const manifest = rebuildDeck(deckId);
  res.json({ ok: true, slide: deckData.slides[idx], manifestStatus: manifest.slides[idx]?.status });
});

app.put("/api/decks/:deckId/slides/:slideId/script", auth, (req, res) => {
  const { deckId, slideId } = req.params;
  const script = req.body?.script ?? "";
  const manifest = readManifest(MANIFEST_PATH);
  const slide = manifest.slides.find((s) => s.slideId === slideId);
  if (!slide) return res.status(404).json({ error: "narration slide not found" });
  slide.script = script;
  slide.estimatedSeconds = estimateSecondsFromScript(script);
  slide.status = "pending_review";
  slide.approvedAt = null;
  slide.approvedBy = null;
  recalcManifestMeta(manifest);
  writeManifest(manifest);
  res.json({ ok: true, slide });
});

app.post("/api/decks/:deckId/slides/:slideId/regenerate-script", auth, async (req, res) => {
  const { deckId, slideId } = req.params;
  const combined = loadCombinedSlide(deckId, slideId);
  if (!combined) return res.status(404).json({ error: "slide not found" });
  const { manifest } = combined;
  const idx = manifest.slides.findIndex((s) => s.slideId === slideId);
  const context = buildGenerationContext(manifest, idx);
  const slideRecord = manifest.slides[idx];
  const result = await generateScriptWithLlm(slideRecord, context);
  const slide = manifest.slides[idx];
  slide.script = result.script;
  slide.estimatedSeconds = result.estimatedSeconds;
  slide.generatedAt = new Date().toISOString();
  slide.generationNotes = result.generationNotes;
  slide.status = "pending_review";
  recalcManifestMeta(manifest);
  writeManifest(manifest);
  res.json({ ok: true, slide, generation: result });
});

app.post("/api/decks/:deckId/slides/:slideId/synthesize", auth, async (req, res) => {
  const { deckId, slideId } = req.params;
  const gender = req.body?.gender;
  const voiceId = resolveVoiceId(gender, req.body?.voiceId);
  const manifest = readManifest(MANIFEST_PATH);
  const slide = manifest.slides.find((s) => s.slideId === slideId);
  if (!slide) return res.status(404).json({ error: "slide not found" });
  if (!slide.script) return res.status(400).json({ error: "script is empty" });

  slide.voice = { ...(slide.voice || manifest.voice), provider: "openai", voiceId, speed: Number(req.body?.speed || 1) };
  slide.status = "approved";
  slide.approvedAt = new Date().toISOString();
  slide.approvedBy = "admin-ui";

  const adapter = await getTtsAdapter(process.env.NARRATION_TTS_PROVIDER || "openai");
  const outPath = audioAbsolutePath(slideId);
  try {
    const result = await adapter.synthesize({
      text: slide.script,
      voiceId,
      speed: slide.voice.speed,
      outputPath: outPath,
    });
    setSlideAudioReady(slide, result.durationSeconds);
    slide.audioUrl = audioRelativeUrl(slideId);
    recalcManifestMeta(manifest);
    writeManifest(manifest);
    res.json({ ok: true, slide, tts: result });
  } catch (err) {
    setSlideAudioFailed(slide, err.message || String(err));
    writeManifest(manifest);
    res.status(500).json({ error: err.message || String(err), slide });
  }
});

app.post("/api/decks/:deckId/rebuild", auth, (req, res) => {
  const manifest = rebuildDeck(req.params.deckId);
  res.json({ ok: true, slides: manifest.slides.length });
});

app.use("/admin", express.static(path.join(REPO_ROOT, "admin")));
app.use("/", express.static(PRESENTATIONS_DIR));

app.listen(PORT, () => {
  console.log(`AI-EIP admin server http://localhost:${PORT}`);
  console.log(`  Deck:  http://localhost:${PORT}/enterprise-ai-portal-deck.html`);
  console.log(`  Admin: http://localhost:${PORT}/admin/`);
});
