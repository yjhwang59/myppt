import fs from "node:fs";
import path from "node:path";
import { hashContent } from "./hash.js";
import {
  AUDIO_DIR,
  DEFAULT_VOICE,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  PROMPT_VERSION,
  audioRelativeUrl,
} from "./paths.js";
import { summarizeSlide } from "./extract.js";

export function readManifest(manifestPath = MANIFEST_PATH) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function writeManifest(manifest, manifestPath = MANIFEST_PATH) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function createEmptySlideRecord(slide) {
  const sourceHash = hashContent(slide.extractedContent);
  return {
    slideId: slide.slideId,
    index: slide.index,
    title: slide.title,
    sourceHash,
    extractedContent: slide.extractedContent,
    script: null,
    estimatedSeconds: null,
    status: "empty",
    voice: { ...DEFAULT_VOICE },
    audioUrl: null,
    audioDurationSeconds: null,
    presenter: { name: "default", avatarVideoUrl: null },
    avatarVideoUrl: null,
    captionsUrl: null,
    cuePoints: [],
    generatedAt: null,
    approvedAt: null,
    approvedBy: null,
    generationNotes: null,
  };
}

export function mergeExtractedSlides({
  deckId,
  deckPath,
  extractedSlides,
  existingManifest = null,
}) {
  const byId = new Map((existingManifest?.slides || []).map((s) => [s.slideId, s]));

  const slides = extractedSlides.map((slide) => {
    const sourceHash = hashContent(slide.extractedContent);
    const prev = byId.get(slide.slideId);

    if (!prev) {
      return createEmptySlideRecord(slide);
    }

    const hashChanged = prev.sourceHash !== sourceHash;
    let status = prev.status;
    if (hashChanged && !["empty", "draft"].includes(prev.status)) {
      status = "stale";
    }

    return {
      ...prev,
      index: slide.index,
      title: slide.title,
      sourceHash,
      extractedContent: slide.extractedContent,
      status,
    };
  });

  return {
    version: MANIFEST_VERSION,
    deckId,
    deckPath,
    promptVersion: PROMPT_VERSION,
    modelVersion: existingManifest?.modelVersion ?? null,
    voice: existingManifest?.voice ?? { ...DEFAULT_VOICE },
    presenter: existingManifest?.presenter ?? { name: "default", avatarVideoUrl: null },
    slides,
    meta: {
      lastExtractedAt: new Date().toISOString(),
      totalEstimatedSeconds: slides.reduce((sum, s) => sum + (s.estimatedSeconds || 0), 0),
      ttsCostEstimateUsd: existingManifest?.meta?.ttsCostEstimateUsd ?? 0,
    },
  };
}

export function applyGeneratedScript(slideRecord, generationResult) {
  slideRecord.script = generationResult.script;
  slideRecord.estimatedSeconds = generationResult.estimatedSeconds;
  slideRecord.generatedAt = new Date().toISOString();
  slideRecord.generationNotes = generationResult.generationNotes;
  slideRecord.status = "draft";
  if (generationResult.modelVersion?.startsWith("template")) {
    slideRecord.status = "pending_review";
  }
  return slideRecord;
}

export function buildGenerationContext(manifest, slideIndex) {
  const slides = manifest.slides;
  const slide = slides[slideIndex];
  const prev = slideIndex > 0 ? slides[slideIndex - 1] : null;
  const next = slideIndex < slides.length - 1 ? slides[slideIndex + 1] : null;

  return {
    deckTitle: "企業 AI 入口網整合平台架構",
    slideTotal: slides.length,
    prevSlideSummary: prev ? summarizeSlide(prev) : "",
    nextSlideTitle: next?.title || "",
  };
}

export function ensureAudioDir() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export function setSlideAudioReady(slide, durationSeconds) {
  slide.audioUrl = audioRelativeUrl(slide.slideId);
  slide.audioDurationSeconds = durationSeconds;
  slide.status = "audio_ready";
}

export function setSlideAudioFailed(slide, message) {
  slide.status = "audio_failed";
  slide.generationNotes = [slide.generationNotes, message].filter(Boolean).join(" | ");
}

export function recalcManifestMeta(manifest) {
  manifest.meta = manifest.meta || {};
  manifest.meta.totalEstimatedSeconds = manifest.slides.reduce(
    (sum, s) => sum + (s.estimatedSeconds || 0),
    0
  );
  return manifest;
}
