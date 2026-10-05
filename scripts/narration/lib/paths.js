import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const PRESENTATIONS_DIR = path.join(REPO_ROOT, "presentations");
export const NARRATION_DIR = path.join(PRESENTATIONS_DIR, "narration");
export const AUDIO_DIR = path.join(NARRATION_DIR, "audio");
export const SCHEMA_PATH = path.join(NARRATION_DIR, "schema.json");
export const PROMPT_PATH = path.join(REPO_ROOT, "scripts/narration/prompts/slide-script.v1.md");

export const DECK_ID = "enterprise-ai-portal-deck";
export const DECK_HTML = path.join(PRESENTATIONS_DIR, "enterprise-ai-portal-deck.html");
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

export function audioFileName(slideId) {
  const num = slideId.replace(/^s/, "").padStart(2, "0");
  return `s${num}.mp3`;
}

/** Relative to presentations/ root (same as deck HTML). */
export function audioRelativeUrl(slideId) {
  return `narration/audio/${audioFileName(slideId)}`;
}

export const DECKS_DIR = path.join(PRESENTATIONS_DIR, "decks");

export function slidesJsonPath(deckId = DECK_ID) {
  return path.join(DECKS_DIR, `${deckId}.slides.json`);
}

/** Public deck HTML. Enterprise stays on the historical constant. */
export function deckHtmlPath(deckId = DECK_ID) {
  if (deckId === DECK_ID) return DECK_HTML;
  return path.join(PRESENTATIONS_DIR, `${deckId}.html`);
}

export function audioAbsolutePath(slideId) {
  return path.join(AUDIO_DIR, audioFileName(slideId));
}
