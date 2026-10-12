import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import {
  DECK_ID,
  PRESENTATIONS_DIR,
  REPO_ROOT,
  assertDeckId,
  audioAbsolutePath,
  audioRelativeUrl,
  deckHtmlPath,
  isDeckId,
  manifestPath,
  slidesJsonPath,
} from "../scripts/narration/lib/paths.js";
import { readSlidesJson, writeSlidesJson } from "../scripts/narration/lib/slide-model.js";
import {
  readManifest,
  writeManifest,
  setSlideAudioReady,
  setSlideAudioFailed,
  recalcManifestMeta,
  buildGenerationContext,
  mergeExtractedSlides,
} from "../scripts/narration/lib/manifest.js";
import { generateScriptWithLlm } from "../scripts/narration/lib/llm.js";
import { estimateSecondsFromScript, extractDeckFromFile } from "../scripts/narration/lib/extract.js";
import { getDeckPolicy, listAdminDecks } from "../scripts/narration/lib/registry.js";
import { assessHtmlRebuild, rebuildDecision } from "../scripts/narration/lib/rebuild-safety.js";
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

function sendError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || String(err), code: err.code });
}

function getDeckPaths(deckId) {
  const id = assertDeckId(deckId);
  return {
    deckId: id,
    slidesPath: slidesJsonPath(id),
    manifestPath: manifestPath(id),
    deckHtml: deckHtmlPath(id),
  };
}

function loadCombinedSlide(deckId, slideId) {
  const { slidesPath, manifestPath: narrationPath } = getDeckPaths(deckId);
  const deckData = readSlidesJson(slidesPath);
  const slide = deckData.slides.find((s) => s.slideId === slideId);
  if (!slide) return null;
  const manifest = readManifest(narrationPath);
  const narration = manifest?.slides?.find((s) => s.slideId === slideId) || null;
  return { deckData, slide, manifest, narration, narrationPath };
}

function planRebuild(deckId, deckData) {
  const paths = getDeckPaths(deckId);
  const policy = getDeckPolicy(paths.deckId);
  if (!deckData) {
    if (!fs.existsSync(paths.slidesPath)) {
      const error = new Error("slides.json not found");
      error.status = 404;
      throw error;
    }
    deckData = readSlidesJson(paths.slidesPath);
  }
  const html = fs.existsSync(paths.deckHtml) ? fs.readFileSync(paths.deckHtml, "utf8") : "";
  const assessment = assessHtmlRebuild(html, deckData);
  const decision = rebuildDecision(policy, assessment);
  return { ...paths, policy, deckData, assessment, decision };
}

function assertRebuildAllowed(plan) {
  if (plan.decision.write) return;
  const error = new Error(`HTML rebuild blocked: ${plan.decision.reason}`);
  error.status = 409;
  error.code = "html-rebuild-blocked";
  throw error;
}

function commitRebuild(plan) {
  assertRebuildAllowed(plan);
  if (!plan.assessment.patched) {
    const error = new Error(plan.assessment.summary || "refused to write HTML");
    error.status = 409;
    error.code = "html-rebuild-blocked";
    throw error;
  }
  writeSlidesJson(plan.slidesPath, plan.deckData);
  fs.writeFileSync(plan.deckHtml, plan.assessment.patched, "utf8");

  const extracted = extractDeckFromFile(plan.deckHtml);
  const existing = readManifest(plan.manifestPath);
  const manifest = mergeExtractedSlides({
    deckId: plan.deckId,
    deckPath: path.basename(plan.deckHtml),
    extractedSlides: extracted,
    existingManifest: existing,
  });
  recalcManifestMeta(manifest);
  writeManifest(manifest, plan.manifestPath);
  return manifest;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, deckId: DECK_ID });
});

app.get("/api/voices", auth, (_req, res) => {
  res.json({ voices: ALL_VOICES });
});

app.get("/api/decks", auth, (_req, res) => {
  res.json({ decks: listAdminDecks() });
});

app.get("/api/decks/:deckId/slides", auth, (req, res) => {
  try {
    if (!isDeckId(req.params.deckId)) return res.status(400).json({ error: "invalid deckId" });
    const plan = planRebuild(req.params.deckId);
    const manifest = readManifest(plan.manifestPath);
    const rows = plan.deckData.slides.map((slide) => {
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
    res.json({
      deckId: plan.deckId,
      title: plan.deckData.title,
      slides: rows,
      voice: manifest?.voice,
      policy: plan.policy,
      rebuild: { allowed: plan.decision.write, summary: plan.decision.reason },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/decks/:deckId/slides/:slideId", auth, (req, res) => {
  try {
    const combined = loadCombinedSlide(req.params.deckId, req.params.slideId);
    if (!combined) return res.status(404).json({ error: "slide not found" });
    const { slide, narration, manifest } = combined;
    res.json({
      slide,
      narration,
      voice: narration?.voice || manifest?.voice,
      gender: genderFromVoiceId(narration?.voice?.voiceId || manifest?.voice?.voiceId),
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.put("/api/decks/:deckId/slides/:slideId", auth, (req, res) => {
  try {
    const { deckId, slideId } = req.params;
    const current = planRebuild(deckId);
    const deckData = structuredClone(current.deckData);
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
    const plan = planRebuild(deckId, deckData);
    const manifest = commitRebuild(plan);
    res.json({ ok: true, slide: deckData.slides[idx], manifestStatus: manifest.slides[idx]?.status });
  } catch (err) {
    sendError(res, err);
  }
});

app.put("/api/decks/:deckId/slides/:slideId/script", auth, (req, res) => {
  try {
    const { deckId, slideId } = req.params;
    const { manifestPath: narrationPath } = getDeckPaths(deckId);
    const script = req.body?.script ?? "";
    const manifest = readManifest(narrationPath);
    const slide = manifest?.slides?.find((s) => s.slideId === slideId);
    if (!slide) return res.status(404).json({ error: "narration slide not found" });
    slide.script = script;
    slide.estimatedSeconds = estimateSecondsFromScript(script);
    slide.status = "pending_review";
    slide.approvedAt = null;
    slide.approvedBy = null;
    recalcManifestMeta(manifest);
    writeManifest(manifest, narrationPath);
    res.json({ ok: true, slide });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/decks/:deckId/slides/:slideId/regenerate-script", auth, async (req, res) => {
  try {
    const { deckId, slideId } = req.params;
    const combined = loadCombinedSlide(deckId, slideId);
    if (!combined?.manifest) return res.status(404).json({ error: "slide not found" });
    const { manifest, deckData, narrationPath } = combined;
    const idx = manifest.slides.findIndex((s) => s.slideId === slideId);
    if (idx < 0) return res.status(404).json({ error: "narration slide not found" });
    const context = buildGenerationContext(manifest, idx, { deckTitle: deckData.title });
    const slideRecord = manifest.slides[idx];
    const result = await generateScriptWithLlm(slideRecord, context);
    const slide = manifest.slides[idx];
    slide.script = result.script;
    slide.estimatedSeconds = result.estimatedSeconds;
    slide.generatedAt = new Date().toISOString();
    slide.generationNotes = result.generationNotes;
    slide.status = "pending_review";
    recalcManifestMeta(manifest);
    writeManifest(manifest, narrationPath);
    res.json({ ok: true, slide, generation: result });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/decks/:deckId/slides/:slideId/synthesize", auth, async (req, res) => {
  try {
    const { deckId, slideId } = req.params;
    const { manifestPath: narrationPath } = getDeckPaths(deckId);
    const gender = req.body?.gender;
    const voiceId = resolveVoiceId(gender, req.body?.voiceId);
    const manifest = readManifest(narrationPath);
    const slide = manifest?.slides?.find((s) => s.slideId === slideId);
    if (!slide) return res.status(404).json({ error: "slide not found" });
    if (!slide.script) return res.status(400).json({ error: "script is empty" });

    const resolvedDeckId = manifest.deckId || assertDeckId(deckId);
    slide.voice = { ...(slide.voice || manifest.voice), provider: "openai", voiceId, speed: Number(req.body?.speed || 1) };
    slide.status = "approved";
    slide.approvedAt = new Date().toISOString();
    slide.approvedBy = "admin-ui";

    const adapter = await getTtsAdapter(process.env.NARRATION_TTS_PROVIDER || "openai");
    const outPath = audioAbsolutePath(slideId, resolvedDeckId);
    try {
      const result = await adapter.synthesize({
        text: slide.script,
        voiceId,
        speed: slide.voice.speed,
        outputPath: outPath,
      });
      setSlideAudioReady(slide, result.durationSeconds, resolvedDeckId);
      slide.audioUrl = audioRelativeUrl(slideId, resolvedDeckId);
      recalcManifestMeta(manifest);
      writeManifest(manifest, narrationPath);
      res.json({ ok: true, slide, tts: result });
    } catch (err) {
      setSlideAudioFailed(slide, err.message || String(err));
      writeManifest(manifest, narrationPath);
      res.status(500).json({ error: err.message || String(err), slide });
    }
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/decks/:deckId/rebuild", auth, (req, res) => {
  try {
    const manifest = commitRebuild(planRebuild(req.params.deckId));
    res.json({ ok: true, slides: manifest.slides.length });
  } catch (err) {
    sendError(res, err);
  }
});

app.use("/admin", express.static(path.join(REPO_ROOT, "admin")));
app.use("/", express.static(PRESENTATIONS_DIR));

app.listen(PORT, () => {
  console.log(`AI-EIP admin server http://localhost:${PORT}`);
  console.log(`  Deck:  http://localhost:${PORT}/enterprise-ai-portal-deck.html`);
  console.log(`  Admin: http://localhost:${PORT}/admin/?deck=${DECK_ID}`);
});
