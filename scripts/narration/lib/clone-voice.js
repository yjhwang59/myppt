import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.js";

export const RECORDINGS_DIR = path.join(REPO_ROOT, "recordings");

const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac", ".mp4"]);

const MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "audio/mp4",
};

export function listRecordingFiles(dir = RECORDINGS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => {
      if (name.startsWith(".")) return false;
      return AUDIO_EXT.has(path.extname(name).toLowerCase());
    })
    .sort()
    .map((name) => path.join(dir, name));
}

const CLONED_CATEGORIES = new Set(["cloned", "professional"]);

export function isClonedVoice(voice) {
  return CLONED_CATEGORIES.has(voice?.category);
}

/**
 * Pick the voice this project should use.
 * An id that exists on the account wins. Otherwise an explicit name, otherwise the only clone.
 * @param {Array<{ voice_id?: string, name?: string, category?: string }>} voices
 * @param {{ voiceId?: string, name?: string }} [options]
 */
export function selectClonedVoice(voices, { voiceId = "", name = "" } = {}) {
  const list = Array.isArray(voices) ? voices : [];
  const id = String(voiceId || "").trim();
  if (id) {
    const exact = list.find((voice) => voice.voice_id === id);
    if (exact) return { voice: exact, reason: "id" };
  }
  const cloned = list.filter(isClonedVoice);
  const wanted = String(name || "").trim();
  if (wanted) {
    const named = cloned.filter((voice) => voice.name === wanted);
    if (named.length === 1) return { voice: named[0], reason: "name" };
    if (named.length > 1) return { error: "ambiguous-name", matches: named };
    return { error: "name-not-found", matches: cloned };
  }
  if (cloned.length === 1) return { voice: cloned[0], reason: "only" };
  if (cloned.length > 1) return { error: "ambiguous", matches: cloned };
  return { error: "none", matches: [] };
}

export function formatElevenLabsError(status, raw) {
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    const msg = detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join("; ");
    return `ElevenLabs ${status}: ${msg || String(raw).slice(0, 300)}`;
  }
  if (detail && typeof detail === "object") {
    if (detail.status === "missing_permissions" || detail.code === "missing_permissions") {
      return `ElevenLabs API key 權限不足：${detail.message || "missing_permissions"}。請在金鑰設定開啟 Voices 的寫入，以及 Text to Speech。`;
    }
    if (detail.status === "can_not_use_instant_voice_cloning" || detail.code === "can_not_use_instant_voice_cloning") {
      return "此 API key 所屬方案不能建立 Instant Voice Clone。請確認金鑰是在已付費的工作區建立的。";
    }
    if (detail.message) return `ElevenLabs ${status}: ${detail.message}`;
  }
  return `ElevenLabs ${status}: ${String(raw).slice(0, 500)}`;
}

const OPENAI_PRESET_VOICES = new Set([
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
]);

/** Keep a cloned voice when the admin UI still sends an OpenAI preset id. */
export function resolveSynthesisTarget({ manifest, slide, requestedVoiceId, speed } = {}) {
  const voice = slide?.voice?.provider === "elevenlabs"
    ? slide.voice
    : manifest?.voice?.provider === "elevenlabs"
      ? manifest.voice
      : null;
  if (!voice) return null;
  const requested = String(requestedVoiceId || "").trim();
  if (requested && requested !== voice.voiceId && !OPENAI_PRESET_VOICES.has(requested)) return null;
  return {
    provider: "elevenlabs",
    voiceId: voice.voiceId || process.env.ELEVENLABS_VOICE_ID || "",
    speed: speed ?? voice.speed ?? 1,
  };
}

export function applyClonedVoice(manifest, voiceId, speed) {
  const resolvedSpeed = speed ?? manifest.voice?.speed ?? 1;
  const voice = {
    provider: "elevenlabs",
    voiceId,
    speed: resolvedSpeed,
  };
  manifest.voice = voice;
  for (const slide of manifest.slides || []) {
    slide.voice = {
      ...(slide.voice || {}),
      provider: "elevenlabs",
      voiceId,
      speed: slide.voice?.speed ?? resolvedSpeed,
    };
  }
  return manifest;
}

export function upsertEnvAssignment(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed}${trimmed ? "\n" : ""}${line}\n`;
}

export function writeEnvAssignment(envPath, key, value) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  fs.writeFileSync(envPath, upsertEnvAssignment(current, key, value));
}

/**
 * @param {string[]} filePaths
 * @param {{ name: string, description?: string, denoise?: boolean }} options
 */
export function buildCloneForm(filePaths, { name, description, denoise = false }) {
  const form = new FormData();
  form.append("name", name);
  if (description) form.append("description", description);
  if (denoise) form.append("remove_background_noise", "true");
  form.append("labels", JSON.stringify({ language: "zh" }));
  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    const bytes = fs.readFileSync(filePath);
    form.append(
      "files",
      new File([bytes], path.basename(filePath), { type: MIME[ext] || "application/octet-stream" }),
    );
  }
  return form;
}
