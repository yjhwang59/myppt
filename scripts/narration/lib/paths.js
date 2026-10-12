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

/** Default deck for CLIs that omit --deck. Enterprise remains the historical default. */
export const DECK_ID = "enterprise-ai-portal-deck";
export const DECK_HTML = path.join(PRESENTATIONS_DIR, `${DECK_ID}.html`);

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

const DECK_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isDeckId(deckId) {
  return typeof deckId === "string" && DECK_ID_PATTERN.test(deckId);
}

export function assertDeckId(deckId) {
  if (!isDeckId(deckId)) {
    const error = new Error("invalid deckId");
    error.status = 400;
    throw error;
  }
  return deckId;
}

/**
 * Resolve a deck from CLI args.
 * `--deck=<id>` wins. Otherwise `positional` (build:deck) or the enterprise default.
 */
export function resolveDeckId(argv = process.argv.slice(2), { positional = false } = {}) {
  const flagged = argv.find((arg) => arg.startsWith("--deck="));
  if (flagged) return assertDeckId(flagged.slice("--deck=".length));
  if (positional) {
    const first = argv.find((arg) => arg && !arg.startsWith("--"));
    if (first) return assertDeckId(first);
  }
  return DECK_ID;
}

export function manifestPath(deckId = DECK_ID) {
  return path.join(NARRATION_DIR, `${assertDeckId(deckId)}.json`);
}

/** Historical constant: enterprise narration manifest. */
export const MANIFEST_PATH = manifestPath(DECK_ID);

export function slidesJsonPath(deckId = DECK_ID) {
  return path.join(DECKS_DIR, `${assertDeckId(deckId)}.slides.json`);
}

export function deckHtmlPath(deckId = DECK_ID) {
  return path.join(PRESENTATIONS_DIR, `${assertDeckId(deckId)}.html`);
}

export function audioFileName(slideId) {
  const num = String(slideId || "").replace(/^s/, "").padStart(2, "0");
  return `s${num}.mp3`;
}

/** Public URL relative to presentations/ (same directory as deck HTML). */
export function audioRelativeUrl(slideId, deckId = DECK_ID) {
  return `narration/audio/${assertDeckId(deckId)}/${audioFileName(slideId)}`;
}

/**
 * Pre-migration enterprise URLs: presentations/narration/audio/sNN.mp3.
 * Kept as symlinks onto the per-deck files so old links still resolve.
 */
export function legacyAudioRelativeUrl(slideId) {
  return `narration/audio/${audioFileName(slideId)}`;
}

export function audioDirForDeck(deckId = DECK_ID) {
  return path.join(AUDIO_DIR, assertDeckId(deckId));
}

export function audioAbsolutePath(slideId, deckId = DECK_ID) {
  return path.join(audioDirForDeck(deckId), audioFileName(slideId));
}

export function legacyAudioAbsolutePath(slideId) {
  return path.join(AUDIO_DIR, audioFileName(slideId));
}
