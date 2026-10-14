import fs from "node:fs";
import path from "node:path";
import {
  SOURCE_TRANSCRIPT_MAX_CHARS,
  TRANSCRIPTS_DIR,
  sourceTranscriptPath,
} from "../../scripts/narration/lib/paths.js";

export function ensureTranscriptsDir() {
  fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
}

export function readSourceTranscript(deckId) {
  const filePath = sourceTranscriptPath(deckId);
  if (!fs.existsSync(filePath)) {
    return { text: "", charCount: 0, truncated: false, updatedAt: null };
  }
  const text = fs.readFileSync(filePath, "utf8");
  return {
    text,
    charCount: text.length,
    truncated: false,
    updatedAt: fs.statSync(filePath).mtime.toISOString(),
  };
}

export function writeSourceTranscript(deckId, rawText) {
  ensureTranscriptsDir();
  let text = String(rawText ?? "");
  let truncated = false;
  if (text.length > SOURCE_TRANSCRIPT_MAX_CHARS) {
    text = text.slice(0, SOURCE_TRANSCRIPT_MAX_CHARS);
    truncated = true;
  }
  const filePath = sourceTranscriptPath(deckId);
  fs.writeFileSync(filePath, text, "utf8");
  return {
    text,
    charCount: text.length,
    truncated,
    updatedAt: new Date().toISOString(),
  };
}

export function deleteSourceTranscript(deckId) {
  const filePath = sourceTranscriptPath(deckId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
