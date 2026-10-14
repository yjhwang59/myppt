const PRESET_VOICES = new Set(["nova", "shimmer", "onyx", "echo"]);

export const CONSENT_PHRASE = "我是此声音的拥有者并授权OpenAI使用此声音创建语音合成模型";

export function normalizeAudioMime(type) {
  const base = String(type || "audio/webm").split(";")[0].trim().toLowerCase();
  if (base === "audio/x-wav") return "audio/wav";
  const allowed = new Set([
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/flac",
    "audio/webm",
    "audio/mp4",
  ]);
  return allowed.has(base) ? base : "audio/webm";
}

export function audioExtension(mime) {
  const type = normalizeAudioMime(mime);
  if (type === "audio/mpeg") return "mp3";
  if (type === "audio/wav") return "wav";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/aac") return "aac";
  if (type === "audio/flac") return "flac";
  if (type === "audio/mp4") return "mp4";
  return "webm";
}

export function isCustomVoiceId(voiceId, customVoiceId) {
  if (!voiceId) return false;
  if (customVoiceId && voiceId === customVoiceId) return true;
  return String(voiceId).startsWith("voice_");
}

export function resolveStudioVoiceId(requested, customVoiceId) {
  if (isCustomVoiceId(requested, customVoiceId)) return requested;
  if (PRESET_VOICES.has(requested)) return requested;
  return "nova";
}

export function buildSpeechBody({ text, voiceId, speed = 1, customVoiceId }) {
  if (isCustomVoiceId(voiceId, customVoiceId)) {
    return {
      model: "gpt-4o-mini-tts",
      input: text,
      voice: { id: voiceId },
      response_format: "mp3",
    };
  }
  return {
    model: "tts-1",
    input: text,
    voice: voiceId || "nova",
    speed: Number(speed) || 1,
    response_format: "mp3",
  };
}

export function estimateMp3Duration(byteLength) {
  if (!byteLength || byteLength < 128) return null;
  return Number((byteLength / 16000).toFixed(1));
}

export function customVoiceError(status, body) {
  const text = String(body || "");
  if (
    status === 401 ||
    status === 403 ||
    /not authorized|permission|eligible|custom voice|insufficient/i.test(text)
  ) {
    return "此 OpenAI 專案尚未開通 Custom Voices。預設 AI 聲音仍可使用。";
  }
  return null;
}
