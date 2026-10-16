import fs from "node:fs";
import path from "node:path";
import { registerTtsProvider, estimateTtsCostUsd } from "./index.js";

const DEFAULT_MODEL = "eleven_multilingual_v2";

async function getAudioDurationSeconds(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 128) return null;
    return Number((buf.length / 16000).toFixed(1));
  } catch {
    return null;
  }
}

/** ElevenLabs speed is accepted in 0.7–1.2. Manifest schema allows 0.5–2. */
export function clampElevenLabsSpeed(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.2, Math.max(0.7, n));
}

export function resolveElevenLabsVoiceId(voiceId) {
  const id = String(voiceId || process.env.ELEVENLABS_VOICE_ID || "").trim();
  return id;
}

export function buildElevenLabsTtsBody({ text, speed, modelId }) {
  const stability = Number(process.env.ELEVENLABS_STABILITY ?? 0.5);
  const similarity = Number(process.env.ELEVENLABS_SIMILARITY ?? 0.75);
  return {
    text,
    model_id: modelId || process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
    voice_settings: {
      stability: Number.isFinite(stability) ? stability : 0.5,
      similarity_boost: Number.isFinite(similarity) ? similarity : 0.75,
      speed: clampElevenLabsSpeed(speed),
    },
  };
}

registerTtsProvider("elevenlabs", async () => ({
  async synthesize({ text, voiceId, speed, outputPath }) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY 未設定，無法使用 ElevenLabs TTS");
    }
    const resolvedVoiceId = resolveElevenLabsVoiceId(voiceId);
    if (!resolvedVoiceId) {
      throw new Error("未設定 ElevenLabs voice id。請先執行 node scripts/narration/clone-voice.js");
    }

    const timeoutMs = Number(process.env.NARRATION_TTS_TIMEOUT_MS || 120000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(resolvedVoiceId)}?output_format=mp3_44100_128`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(buildElevenLabsTtsBody({ text, speed })),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ElevenLabs TTS ${res.status}: ${errText.slice(0, 300)}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

      const durationSeconds = await getAudioDurationSeconds(outputPath);
      return {
        outputPath,
        durationSeconds,
        costUsd: estimateTtsCostUsd(text, "elevenlabs"),
        provider: "elevenlabs",
      };
    } finally {
      clearTimeout(timer);
    }
  },
}));

export {};
