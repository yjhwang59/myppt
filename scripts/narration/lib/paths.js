import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const PRESENTATIONS_DIR = path.join(REPO_ROOT, "presentations");
export const NARRATION_DIR = path.join(PRESENTATIONS_DIR, "narration");
export const AUDIO_DIR = path.join(NARRATION_DIR, "audio");
export const SCHEMA_PATH = path.join(NARRATION_DIR, "schema.json");
export const PROMPT_PATH = path.join(REPO_ROOT, "scripts/narration/prompts/slide-script.v1.md");
export const DECKS_DIR = path.join(PRESENTATIONS_DIR, "decks");
export const REGISTRY_PATH = path.join(DECKS_DIR, "registry.json");
export const UPLOADS_DIR = path.join(REPO_ROOT, "data", "uploads");
export const TRANSCRIPTS_DIR = path.join(REPO_ROOT, "data", "transcripts");

export const SOURCE_TRANSCRIPT_MAX_CHARS = 200_000;

/** Default / legacy deck. */
export const DECK_ID = "enterprise-ai-portal-deck";
export const DECK_HTML = path.join(PRESENTATIONS_DIR, `${DECK_ID}.html`);
export const MANIFEST_PATH = path.join(NARRATION_DIR, `${DECK_ID}.json`);

export const PROMPT_VERSION = "1.0.0";
export const MANIFEST_VERSION = "1.0.0";

export const SLIDE_STATUSES = [
  "empty",
  "draft",
  "pending_review",
  "approved",
  "stale",
  "audio_ready",
  "audio_failed",
];

export const DEFAULT_VOICE = {
  provider: process.env.NARRATION_TTS_PROVIDER || "openai",
  voiceId: process.env.NARRATION_TTS_VOICE || "nova",
  speed: Number(process.env.NARRATION_TTS_SPEED || 1.0),
};

export const DECK_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidDeckId(deckId) {
  return typeof deckId === "string" && DECK_ID_RE.test(deckId) && deckId.length <= 80;
}

/** Turn a filename / title into a deck slug. */
export function slugifyDeckId(input) {
  const base = String(input || "deck")
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = base || "deck";
  return isValidDeckId(slug) ? slug : `deck-${Date.now().toString(36)}`;
}

export function deckHtmlPath(deckId = DECK_ID) {
  return path.join(PRESENTATIONS_DIR, `${deckId}.html`);
}

export function manifestPath(deckId = DECK_ID) {
  return path.join(NARRATION_DIR, `${deckId}.json`);
}

export function slidesJsonPath(deckId = DECK_ID) {
  return path.join(DECKS_DIR, `${deckId}.slides.json`);
}

export function deckPagesDir(deckId) {
  return path.join(PRESENTATIONS_DIR, deckId, "pages");
}

export function deckAssetsDir(deckId) {
  return path.join(PRESENTATIONS_DIR, deckId, "assets");
}

export function deckAudioDir(deckId) {
  return path.join(AUDIO_DIR, deckId);
}

export function deckPreviewAudioDir(deckId) {
  return path.join(AUDIO_DIR, deckId, "preview");
}

export function audioFileName(slideId) {
  const num = String(slideId).replace(/^s/, "").padStart(2, "0");
  return `s${num}.mp3`;
}

/** Relative to presentations/ root (same as deck HTML). */
export function audioRelativeUrl(deckId, slideId) {
  if (slideId === undefined) {
    // Legacy CLI: audioRelativeUrl(slideId) — treat as DECK_ID
    return `narration/audio/${DECK_ID}/${audioFileName(deckId)}`;
  }
  return `narration/audio/${deckId}/${audioFileName(slideId)}`;
}

export function previewAudioRelativeUrl(deckId, slideId) {
  return `narration/audio/${deckId}/preview/${audioFileName(slideId)}`;
}

export function audioAbsolutePath(deckId, slideId) {
  if (slideId === undefined) {
    return path.join(deckAudioDir(DECK_ID), audioFileName(deckId));
  }
  return path.join(deckAudioDir(deckId), audioFileName(slideId));
}

export function previewAudioAbsolutePath(deckId, slideId) {
  return path.join(deckPreviewAudioDir(deckId), audioFileName(slideId));
}

export function pageImageRelativeUrl(deckId, pageIndex) {
  const num = String(pageIndex).padStart(2, "0");
  return `${deckId}/pages/p${num}.png`;
}

export function pageImageAbsolutePath(deckId, pageIndex) {
  const num = String(pageIndex).padStart(2, "0");
  return path.join(deckPagesDir(deckId), `p${num}.png`);
}

export function sourceTranscriptPath(deckId) {
  return path.join(TRANSCRIPTS_DIR, `${deckId}.txt`);
}

/** Resolve page PNG on disk from extractedContent.pageImageUrl (relative to presentations/). */
export function pageImageAbsoluteFromUrl(pageImageUrl) {
  if (!pageImageUrl) return null;
  const abs = path.join(PRESENTATIONS_DIR, pageImageUrl);
  return fs.existsSync(abs) ? abs : null;
}
