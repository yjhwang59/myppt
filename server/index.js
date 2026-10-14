import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import {
  DECK_ID,
  PRESENTATIONS_DIR,
  REPO_ROOT,
  UPLOADS_DIR,
  audioAbsolutePath,
  audioRelativeUrl,
  deckHtmlPath,
  isValidDeckId,
  manifestPath,
  previewAudioAbsolutePath,
  previewAudioRelativeUrl,
  slidesJsonPath,
  slugifyDeckId,
} from "../scripts/narration/lib/paths.js";
import {
  readManifest,
  writeManifest,
  mergeExtractedSlides,
  recalcManifestMeta,
  setSlideAudioReady,
  setSlideAudioFailed,
  ensureAudioDir,
  markScriptEdited,
  applyGeneratedScript,
} from "../scripts/narration/lib/manifest.js";
import { readSlidesJson, writeSlidesJson, patchDeckHtml } from "../scripts/narration/lib/slide-model.js";
import { extractDeckFromFile, estimateSecondsFromScript, shouldSkipHtmlPatch } from "../scripts/narration/lib/extract.js";
import { fetchRemoteHtml, titleFromHtml } from "./lib/html-import.js";
import { persistHtmlDeck } from "./lib/persist-html-deck.js";
import { ALL_VOICES, resolveVoiceId, genderFromVoiceId } from "./lib/voices.js";
import { listLlmModels, resolveLlmModel } from "./lib/llm-models.js";
import { readSourceTranscript, writeSourceTranscript } from "./lib/transcript.js";
import { generateSlideScript } from "./lib/script-generation.js";
import "../scripts/narration/lib/tts/openai-adapter.js";
import { getTtsAdapter, estimateTtsCostUsd } from "../scripts/narration/lib/tts/index.js";
import { importPdfToPages, pdfPagesToExtracted } from "./lib/pdf-import.js";
import {
  listDecks,
  getDeckSummary,
  upsertRegistryEntry,
  ensureDeckDirs,
  updateDeckCatalog,
  deleteDeck,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  catalogPatchFromBody,
  CatalogError,
} from "./lib/registry.js";
import { verifyGoogleIdToken } from "./lib/google-auth.js";
import {
  SESSION_COOKIE,
  REMEMBER_MAX_AGE_MS,
  googleAuthConfig,
  isEmailAllowed,
  readSession,
  sessionExpiry,
  signSession,
} from "./lib/session.js";
import { deleteSourceTranscript } from "./lib/transcript.js";
import { createJob, getJob, runJob } from "./lib/jobs.js";
import { runWranglerDeploy, publicDeckUrl } from "./lib/publish.js";

const PORT = Number(process.env.ADMIN_PORT || 8787);
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret-change-me";

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function wantsJson(req) {
  const type = String(req.headers["content-type"] || "");
  const accept = String(req.headers.accept || "");
  return type.includes("application/json") || accept.includes("application/json");
}

function cookieOptions(remember) {
  const opts = { httpOnly: true, sameSite: "lax", path: "/" };
  if (remember) opts.maxAge = REMEMBER_MAX_AGE_MS;
  return opts;
}

function rememberRequested(body) {
  return body?.remember === true || body?.remember === "1" || body?.remember === "on";
}

function sendCatalogError(res, err) {
  const status = err instanceof CatalogError ? err.status : 500;
  const body = { error: err instanceof CatalogError ? err.message : "操作失敗" };
  if (err?.deckCount) body.deckCount = err.deckCount;
  res.status(status).json(body);
}

ensureDeckDirs();
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = (file.originalname || "").toLowerCase();
    if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".pdf")) cb(null, true);
    else cb(new Error("僅支援 .html 或 .pdf"));
  },
});

const transcriptUpload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = (file.originalname || "").toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md")) cb(null, true);
    else cb(new Error("僅支援 .txt 或 .md"));
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));

function auth(req, res, next) {
  const cookieToken = parseCookies(req)[SESSION_COOKIE] || "";
  const session = readSession(cookieToken, ADMIN_SECRET);
  if (!session) return res.status(401).json({ error: "尚未登入" });
  req.adminEmail = session.email;
  next();
}

function getDeckPaths(deckId) {
  return {
    slidesPath: slidesJsonPath(deckId),
    manifestFile: manifestPath(deckId),
    deckHtml: deckHtmlPath(deckId),
  };
}

function loadCombinedSlide(deckId, slideId) {
  const { slidesPath, manifestFile } = getDeckPaths(deckId);
  const deckData = fs.existsSync(slidesPath) ? readSlidesJson(slidesPath) : { slides: [] };
  const slide = deckData.slides?.find((s) => s.slideId === slideId) || null;
  const manifest = readManifest(manifestFile);
  const narration = manifest?.slides?.find((s) => s.slideId === slideId) || null;
  if (!slide && !narration) return null;
  return { deckData, slide, manifest, narration };
}

function rebuildDeck(deckId) {
  const { slidesPath, deckHtml, manifestFile } = getDeckPaths(deckId);
  if (!fs.existsSync(deckHtml)) throw new Error("deck html not found");

  const deckData = fs.existsSync(slidesPath) ? readSlidesJson(slidesPath) : null;
  if (deckData) {
    const html = fs.readFileSync(deckHtml, "utf8");
    if (
      deckData.sourceType !== "pdf" &&
      html.includes('<main id="deck">') &&
      !shouldSkipHtmlPatch(deckData, html)
    ) {
      fs.writeFileSync(deckHtml, patchDeckHtml(html, deckData), "utf8");
    }
  }

  const extracted = extractDeckFromFile(deckHtml);
  const existing = readManifest(manifestFile);
  const manifest = mergeExtractedSlides({
    deckId,
    deckPath: path.basename(deckHtml),
    extractedSlides: extracted,
    existingManifest: existing,
    title: existing?.title,
    sourceType: existing?.sourceType,
    sourceFlavor: existing?.sourceFlavor || deckData?.sourceFlavor,
  });
  recalcManifestMeta(manifest);
  writeManifest(manifest, manifestFile);
  return manifest;
}

function cleanupUpload(file) {
  if (file?.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, defaultDeckId: DECK_ID });
});

app.get("/api/auth/config", (_req, res) => {
  const config = googleAuthConfig();
  res.json({ googleClientId: config.googleClientId, ready: config.ready });
});

app.post("/api/login/google", async (req, res) => {
  const config = googleAuthConfig();
  if (!config.ready) return res.status(503).json({ error: "Google 登入尚未設定" });
  const credential = String(req.body?.credential || "");
  if (!credential) return res.status(400).json({ error: "缺少 Google 登入憑證" });
  try {
    const profile = await verifyGoogleIdToken(credential, config.googleClientId);
    if (!profile.emailVerified) return res.status(403).json({ error: "此 Google 帳號尚未完成信箱驗證" });
    if (!isEmailAllowed(profile.email, config.allowedEmails)) {
      return res.status(403).json({ error: "此 Google 帳號未在白名單" });
    }
    const remember = rememberRequested(req.body);
    const token = signSession(
      { email: profile.email, expiresAt: sessionExpiry(remember) },
      ADMIN_SECRET
    );
    res.cookie(SESSION_COOKIE, token, cookieOptions(remember));
    return res.json({ ok: true, email: profile.email });
  } catch {
    return res.status(401).json({ error: "Google 登入驗證失敗" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  if (wantsJson(req)) return res.json({ ok: true });
  return res.redirect(303, "/admin/");
});

app.get("/api/session", auth, (req, res) => {
  res.json({ ok: true, email: req.adminEmail });
});

app.get("/api/categories", auth, (_req, res) => {
  res.json({ ok: true, categories: listCategories() });
});

app.post("/api/categories", auth, (req, res) => {
  try {
    const category = createCategory(req.body || {});
    res.status(201).json({ ok: true, category });
  } catch (err) {
    sendCatalogError(res, err);
  }
});

app.put("/api/categories/:id", auth, (req, res) => {
  try {
    const category = updateCategory(req.params.id, req.body || {});
    res.json({ ok: true, category });
  } catch (err) {
    sendCatalogError(res, err);
  }
});

app.delete("/api/categories/:id", auth, (req, res) => {
  try {
    const options = {};
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "reassignTo")) {
      options.reassignTo = req.body.reassignTo;
    }
    deleteCategory(req.params.id, options);
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    sendCatalogError(res, err);
  }
});

app.get("/api/voices", auth, (_req, res) => {
  res.json({ voices: ALL_VOICES });
});

app.get("/api/llm-models", auth, (_req, res) => {
  res.json(listLlmModels());
});

app.get("/api/decks/:deckId/source-transcript", auth, (req, res) => {
  const deckId = req.params.deckId;
  if (!isValidDeckId(deckId)) return res.status(400).json({ error: "invalid deckId" });
  const data = readSourceTranscript(deckId);
  res.json({ ok: true, deckId, ...data });
});

app.put("/api/decks/:deckId/source-transcript", auth, (req, res) => {
  const deckId = req.params.deckId;
  if (!isValidDeckId(deckId)) return res.status(400).json({ error: "invalid deckId" });
  const result = writeSourceTranscript(deckId, req.body?.text ?? "");
  res.json({ ok: true, deckId, ...result });
});

app.post("/api/decks/:deckId/source-transcript/upload", auth, (req, res) => {
  transcriptUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || String(err) });
    const deckId = req.params.deckId;
    if (!isValidDeckId(deckId)) {
      cleanupUpload(req.file);
      return res.status(400).json({ error: "invalid deckId" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: "缺少檔案" });
    try {
      const text = fs.readFileSync(file.path, "utf8");
      cleanupUpload(file);
      const result = writeSourceTranscript(deckId, text);
      res.json({ ok: true, deckId, ...result });
    } catch (e) {
      cleanupUpload(file);
      res.status(500).json({ error: e.message || String(e) });
    }
  });
});

app.put("/api/decks/:deckId/voice", auth, (req, res) => {
  const deckId = req.params.deckId;
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });
  const gender = req.body?.gender;
  const voiceId = resolveVoiceId(gender, req.body?.voiceId);
  manifest.voice = {
    ...(manifest.voice || {}),
    provider: "openai",
    voiceId,
    speed: Number(req.body?.speed ?? manifest.voice?.speed ?? 1),
  };
  writeManifest(manifest, mPath);
  res.json({
    ok: true,
    voice: manifest.voice,
    gender: genderFromVoiceId(voiceId),
  });
});

app.put("/api/decks/:deckId/llm-model", auth, (req, res) => {
  const deckId = req.params.deckId;
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });
  const model = resolveLlmModel(req.body?.model, manifest.modelVersion);
  manifest.modelVersion = model;
  writeManifest(manifest, mPath);
  res.json({ ok: true, modelVersion: model });
});

app.get("/api/decks", auth, (_req, res) => {
  res.json({ decks: listDecks() });
});

app.get("/api/decks/:deckId", auth, (req, res) => {
  const summary = getDeckSummary(req.params.deckId);
  if (!summary) return res.status(404).json({ error: "deck not found" });
  res.json(summary);
});

app.put("/api/decks/:deckId", auth, (req, res) => {
  const deckId = req.params.deckId;
  if (!isValidDeckId(deckId)) return res.status(400).json({ error: "deckId 格式無效" });
  if (!getDeckSummary(deckId)) return res.status(404).json({ error: "找不到簡報" });
  try {
    const patch = catalogPatchFromBody(req.body || {});
    if (req.body?.title != null) patch.title = req.body.title;
    const deck = updateDeckCatalog(deckId, patch);
    res.json({ ok: true, deck });
  } catch (err) {
    sendCatalogError(res, err);
  }
});

app.delete("/api/decks/:deckId", auth, (req, res) => {
  const deckId = req.params.deckId;
  if (!isValidDeckId(deckId)) return res.status(400).json({ error: "invalid deckId" });
  if (!getDeckSummary(deckId)) return res.status(404).json({ error: "deck not found" });
  try {
    deleteDeck(deckId);
    deleteSourceTranscript(deckId);
    res.json({ ok: true, deckId });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/decks", auth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || String(err) });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "缺少檔案" });

      const original = file.originalname || "deck";
      const lower = original.toLowerCase();
      let deckId = (req.body.deckId || slugifyDeckId(original)).toLowerCase();
      if (!isValidDeckId(deckId)) {
        cleanupUpload(file);
        return res.status(400).json({ error: "deckId 格式無效（僅 a-z0-9-）" });
      }
      if (fs.existsSync(deckHtmlPath(deckId)) && req.body.overwrite !== "1") {
        cleanupUpload(file);
        return res.status(409).json({ error: `deckId「${deckId}」已存在，請換 id 或 overwrite=1` });
      }

      const title = (req.body.title || original.replace(/\.[^.]+$/, "")).trim() || deckId;
      const buf = fs.readFileSync(file.path);

      if (lower.endsWith(".pdf")) {
        const { pages } = await importPdfToPages(buf, deckId, { title });
        const extracted = pdfPagesToExtracted(pages);
        const existing = readManifest(manifestPath(deckId));
        const manifest = mergeExtractedSlides({
          deckId,
          deckPath: `${deckId}.html`,
          extractedSlides: extracted,
          existingManifest: existing,
          title,
          sourceType: "pdf",
        });
        recalcManifestMeta(manifest);
        writeManifest(manifest, manifestPath(deckId));

        writeSlidesJson(slidesJsonPath(deckId), {
          version: "1.0.0",
          deckId,
          title,
          sourceType: "pdf",
          slides: pages.map((p) => ({
            slideId: p.slideId,
            index: p.index,
            title: p.title,
            layout: "pdf-page",
            lead: p.text,
            pageImageUrl: p.imageUrl,
          })),
        });

        upsertRegistryEntry({ deckId, title, sourceType: "pdf", ...catalogPatchFromBody(req.body) });
        cleanupUpload(file);
        return res.json({ ok: true, deck: getDeckSummary(deckId) });
      }

      const sourceUrl = String(req.body.sourceUrl || "").trim();
      const deck = await persistHtmlDeck({
        html: buf.toString("utf8"),
        deckId,
        title,
        sourceUrl,
        catalog: catalogPatchFromBody(req.body),
      });
      cleanupUpload(file);
      return res.json({ ok: true, deck });
    } catch (e) {
      cleanupUpload(req.file);
      if (e instanceof CatalogError) return sendCatalogError(res, e);
      console.error(e);
      const msg = e.message || String(e);
      const status = /找不到|網址|不允許|僅支援|過大|逾時|格式無效/.test(msg) ? 400 : 500;
      return res.status(status).json({ error: msg });
    }
  });
});

app.post("/api/decks/import-url", auth, async (req, res) => {
  try {
    const sourceUrl = String(req.body?.sourceUrl || "").trim();
    if (!sourceUrl) return res.status(400).json({ error: "請提供來源網址" });

    const { html, sourceUrl: finalUrl } = await fetchRemoteHtml(sourceUrl);
    const urlName = decodeURIComponent(new URL(finalUrl).pathname.split("/").filter(Boolean).pop() || "deck");
    let deckId = (req.body?.deckId || slugifyDeckId(urlName)).toLowerCase();
    if (!isValidDeckId(deckId)) return res.status(400).json({ error: "deckId 格式無效（僅 a-z0-9-）" });
    const overwrite = req.body?.overwrite === "1" || req.body?.overwrite === true;
    if (fs.existsSync(deckHtmlPath(deckId)) && !overwrite) {
      return res.status(409).json({ error: `deckId「${deckId}」已存在，請換 id 或 overwrite=1` });
    }
    const title = String(req.body?.title || "").trim() || titleFromHtml(html, urlName.replace(/\.[^.]+$/, "") || deckId);
    const deck = await persistHtmlDeck({
      html,
      deckId,
      title,
      sourceUrl: finalUrl,
      catalog: catalogPatchFromBody(req.body || {}),
    });
    return res.json({ ok: true, deck });
  } catch (e) {
    if (e instanceof CatalogError) return sendCatalogError(res, e);
    console.error(e);
    const msg = e.message || String(e);
    const status = /找不到|網址|不允許|僅支援|過大|逾時|格式無效|抓取失敗/.test(msg) ? 400 : 500;
    return res.status(status).json({ error: msg });
  }
});

app.get("/api/decks/:deckId/slides", auth, (req, res) => {
  const deckId = req.params.deckId;
  if (!isValidDeckId(deckId)) return res.status(400).json({ error: "invalid deckId" });
  const { slidesPath, manifestFile } = getDeckPaths(deckId);
  const manifest = readManifest(manifestFile);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });

  const deckData = fs.existsSync(slidesPath) ? readSlidesJson(slidesPath) : { slides: [] };
  const byId = new Map((deckData.slides || []).map((s) => [s.slideId, s]));

  const rows = manifest.slides.map((narration) => {
    const slide = byId.get(narration.slideId) || {
      slideId: narration.slideId,
      index: narration.index,
      title: narration.title,
      lead: narration.extractedContent?.lead || "",
      pageImageUrl: narration.extractedContent?.pageImageUrl || null,
    };
    return {
      ...slide,
      title: slide.title || narration.title,
      script: narration.script || "",
      status: narration.status || "empty",
      sourceHash: narration.sourceHash || null,
      audioUrl: narration.audioUrl || null,
      voice: narration.voice || manifest.voice,
      estimatedSeconds: narration.estimatedSeconds,
      pageImageUrl: slide.pageImageUrl || narration.extractedContent?.pageImageUrl || null,
    };
  });

  res.json({
    deckId,
    title: manifest.title || deckData.title || deckId,
    sourceType: manifest.sourceType || deckData.sourceType || "html",
    sourceFlavor: manifest.sourceFlavor || deckData.sourceFlavor || null,
    slides: rows,
    voice: manifest.voice,
    modelVersion: manifest.modelVersion || null,
    meta: manifest.meta,
  });
});

app.get("/api/decks/:deckId/slides/:slideId", auth, (req, res) => {
  const combined = loadCombinedSlide(req.params.deckId, req.params.slideId);
  if (!combined?.narration && !combined?.slide) return res.status(404).json({ error: "slide not found" });
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
  if (!fs.existsSync(slidesPath)) return res.status(404).json({ error: "slides.json not found（PDF 簡報請只改講稿）" });
  const deckData = readSlidesJson(slidesPath);
  if (deckData.sourceType === "pdf") {
    return res.status(400).json({ error: "PDF 簡報不支援編輯投影片欄位" });
  }
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
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  const slide = manifest?.slides?.find((s) => s.slideId === slideId);
  if (!slide) return res.status(404).json({ error: "narration slide not found" });
  slide.script = script;
  slide.estimatedSeconds = estimateSecondsFromScript(script);
  markScriptEdited(slide);
  recalcManifestMeta(manifest);
  writeManifest(manifest, mPath);
  res.json({ ok: true, slide });
});

app.post("/api/decks/:deckId/slides/:slideId/regenerate-script", auth, async (req, res) => {
  const { deckId, slideId } = req.params;
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });
  const idx = manifest.slides.findIndex((s) => s.slideId === slideId);
  if (idx < 0) return res.status(404).json({ error: "slide not found" });
  const previousScript = manifest.slides[idx].script || "";
  const hadAudio = Boolean(manifest.slides[idx].audioUrl) || manifest.slides[idx].status === "audio_ready";
  const result = await generateSlideScript(manifest, idx, req.body || {});
  applyGeneratedScript(manifest.slides[idx], result);
  if (hadAudio || manifest.slides[idx].status === "stale") {
    markScriptEdited(manifest.slides[idx]);
    manifest.slides[idx].script = result.script;
    manifest.slides[idx].estimatedSeconds = result.estimatedSeconds;
    manifest.slides[idx].generatedAt = new Date().toISOString();
    manifest.slides[idx].generationNotes = result.generationNotes;
    manifest.slides[idx].status = "pending_review";
  }
  recalcManifestMeta(manifest);
  writeManifest(manifest, mPath);
  res.json({ ok: true, slide: manifest.slides[idx], previousScript, generation: result });
});

app.post("/api/decks/:deckId/generate-scripts", auth, async (req, res) => {
  const deckId = req.params.deckId;
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });

  const force = Boolean(req.body?.force);
  const batchVisionHigh = Boolean(req.body?.batchVisionHigh);
  const targets = manifest.slides.filter((s) => {
    if (force) return true;
    return !s.script || ["empty", "stale"].includes(s.status);
  });

  const job = createJob("generate-scripts", deckId, targets.length || manifest.slides.length);
  res.status(202).json({ jobId: job.id, total: targets.length });

  runJob(job.id, async (report) => {
    let done = 0;
    for (let i = 0; i < manifest.slides.length; i++) {
      const slide = manifest.slides[i];
      const should =
        force ||
        !slide.script ||
        ["empty", "stale"].includes(slide.status);
      if (!should) continue;
      report(done, targets.length, `生成 ${slide.slideId}`);
      const result = await generateSlideScript(manifest, i, {
        batchMode: true,
        batchVisionHigh,
        model: req.body?.model,
      });
      applyGeneratedScript(slide, result);
      if (result.modelVersion && !result.modelVersion.startsWith("template")) {
        manifest.modelVersion = result.modelVersion;
      }
      done++;
      report(done, targets.length, `完成 ${slide.slideId}`);
      writeManifest(manifest, mPath);
    }
    recalcManifestMeta(manifest);
    writeManifest(manifest, mPath);
    return { generated: done };
  });
});

app.post("/api/decks/:deckId/slides/:slideId/preview-tts", auth, async (req, res) => {
  const { deckId, slideId } = req.params;
  const gender = req.body?.gender;
  const voiceId = resolveVoiceId(gender, req.body?.voiceId);
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  const slide = manifest?.slides?.find((s) => s.slideId === slideId);
  if (!slide) return res.status(404).json({ error: "slide not found" });
  const script = req.body?.script ?? slide.script;
  if (!script) return res.status(400).json({ error: "script is empty" });

  ensureAudioDir(deckId);
  const outPath = previewAudioAbsolutePath(deckId, slideId);
  const adapter = await getTtsAdapter(process.env.NARRATION_TTS_PROVIDER || "openai");
  try {
    const result = await adapter.synthesize({
      text: script,
      voiceId,
      speed: Number(req.body?.speed || slide.voice?.speed || 1),
      outputPath: outPath,
    });
    const url = `${previewAudioRelativeUrl(deckId, slideId)}?t=${Date.now()}`;
    res.json({
      ok: true,
      previewUrl: url,
      voiceId,
      durationSeconds: result.durationSeconds,
      costUsd: result.costUsd,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/decks/:deckId/slides/:slideId/synthesize", auth, async (req, res) => {
  const { deckId, slideId } = req.params;
  const gender = req.body?.gender;
  const voiceId = resolveVoiceId(gender, req.body?.voiceId);
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  const slide = manifest?.slides?.find((s) => s.slideId === slideId);
  if (!slide) return res.status(404).json({ error: "slide not found" });
  if (!slide.script) return res.status(400).json({ error: "script is empty" });

  slide.voice = {
    ...(slide.voice || manifest.voice),
    provider: "openai",
    voiceId,
    speed: Number(req.body?.speed || 1),
  };
  slide.status = "approved";
  slide.approvedAt = new Date().toISOString();
  slide.approvedBy = "admin-ui";

  ensureAudioDir(deckId);
  const adapter = await getTtsAdapter(process.env.NARRATION_TTS_PROVIDER || "openai");
  const outPath = audioAbsolutePath(deckId, slideId);
  try {
    const result = await adapter.synthesize({
      text: slide.script,
      voiceId,
      speed: slide.voice.speed,
      outputPath: outPath,
    });
    setSlideAudioReady(slide, result.durationSeconds, deckId);
    slide.audioUrl = audioRelativeUrl(deckId, slideId);
    recalcManifestMeta(manifest);
    writeManifest(manifest, mPath);
    res.json({ ok: true, slide, tts: result });
  } catch (err) {
    setSlideAudioFailed(slide, err.message || String(err));
    writeManifest(manifest, mPath);
    res.status(500).json({ error: err.message || String(err), slide });
  }
});

app.post("/api/decks/:deckId/synthesize-all", auth, (req, res) => {
  const deckId = req.params.deckId;
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });

  const force = Boolean(req.body?.force);
  const gender = req.body?.gender;
  const voiceId = req.body?.voiceId ? resolveVoiceId(gender, req.body.voiceId) : null;

  const eligible = manifest.slides.filter((s) => {
    if (!s.script) return false;
    if (!force && s.status === "audio_ready" && s.audioUrl) return false;
    return true;
  });

  const costEstimate = eligible.reduce((sum, s) => sum + estimateTtsCostUsd(s.script), 0);
  const job = createJob("synthesize-all", deckId, eligible.length);
  res.status(202).json({
    jobId: job.id,
    total: eligible.length,
    costEstimateUsd: Number(costEstimate.toFixed(4)),
  });

  runJob(job.id, async (report) => {
    ensureAudioDir(deckId);
    const adapter = await getTtsAdapter(process.env.NARRATION_TTS_PROVIDER || "openai");
    const budgetUsd = Number(process.env.NARRATION_TTS_BUDGET_USD || 5);
    let spent = manifest.meta?.ttsCostEstimateUsd || 0;
    let success = 0;
    let failed = 0;

    if (voiceId) {
      manifest.voice = { ...(manifest.voice || {}), provider: "openai", voiceId };
    }

    for (let i = 0; i < eligible.length; i++) {
      const slide = eligible[i];
      report(i, eligible.length, `TTS ${slide.slideId}`);
      const vid = voiceId || slide.voice?.voiceId || manifest.voice?.voiceId || "nova";
      slide.voice = { ...(slide.voice || manifest.voice), provider: "openai", voiceId: vid, speed: slide.voice?.speed || 1 };
      slide.status = "approved";
      slide.approvedAt = new Date().toISOString();
      slide.approvedBy = "admin-ui";

      const est = estimateTtsCostUsd(slide.script);
      if (spent + est > budgetUsd) {
        setSlideAudioFailed(slide, `超過 TTS 預算 $${budgetUsd}`);
        failed++;
        continue;
      }

      try {
        const result = await adapter.synthesize({
          text: slide.script,
          voiceId: vid,
          speed: slide.voice.speed,
          outputPath: audioAbsolutePath(deckId, slide.slideId),
        });
        setSlideAudioReady(slide, result.durationSeconds, deckId);
        spent += result.costUsd;
        success++;
      } catch (err) {
        setSlideAudioFailed(slide, err.message || String(err));
        failed++;
      }
      writeManifest(manifest, mPath);
      report(i + 1, eligible.length, `完成 ${slide.slideId}`);
    }

    manifest.meta = manifest.meta || {};
    manifest.meta.ttsCostEstimateUsd = Number(spent.toFixed(4));
    recalcManifestMeta(manifest);
    writeManifest(manifest, mPath);
    return { success, failed, spent };
  });
});

app.get("/api/jobs/:jobId", auth, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

app.post("/api/decks/:deckId/rebuild", auth, (req, res) => {
  try {
    const manifest = rebuildDeck(req.params.deckId);
    res.json({ ok: true, slides: manifest.slides.length });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/decks/:deckId/publish", auth, async (req, res) => {
  const deckId = req.params.deckId;
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) return res.status(404).json({ error: "manifest not found" });
  if (!fs.existsSync(deckHtmlPath(deckId))) {
    return res.status(400).json({ error: "缺少簡報 HTML" });
  }

  const missingScripts = manifest.slides.filter((s) => !s.script).length;
  const missingAudio = manifest.slides.filter((s) => s.status !== "audio_ready").length;
  const force = Boolean(req.body?.force);
  if ((missingScripts > 0 || missingAudio > 0) && !force) {
    return res.status(400).json({
      error: "尚未準備完整",
      warnings: { missingScripts, missingAudio },
      hint: "傳 force:true 仍可發布",
    });
  }

  try {
    const deploy = await runWranglerDeploy();
    const url = publicDeckUrl(deploy.baseUrl, deckId);
    manifest.meta = manifest.meta || {};
    manifest.meta.publishedAt = new Date().toISOString();
    manifest.meta.publishedUrl = url;
    writeManifest(manifest, mPath);
    upsertRegistryEntry({
      deckId,
      title: manifest.title,
      sourceType: manifest.sourceType,
    });
    res.json({
      ok: true,
      url,
      baseUrl: deploy.baseUrl,
      warnings: { missingScripts, missingAudio },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.use("/admin", (req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});
app.use("/admin", express.static(path.join(REPO_ROOT, "admin")));
app.use("/", express.static(PRESENTATIONS_DIR));

app.listen(PORT, () => {
  console.log(`myPPT簡報工作室 http://localhost:${PORT}`);
  console.log(`  Deck:  http://localhost:${PORT}/enterprise-ai-portal-deck.html`);
  console.log(`  Admin: http://localhost:${PORT}/admin/`);
});
