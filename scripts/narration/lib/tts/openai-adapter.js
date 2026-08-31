import fs from "node:fs";
import path from "node:path";
import { registerTtsProvider, estimateTtsCostUsd } from "./index.js";

async function getAudioDurationSeconds(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // MP3 frame sync heuristic — sufficient for metadata estimate
    if (buf.length < 128) return null;
    // Fallback: ~128kbps => bytes / 16000
    return Number((buf.length / 16000).toFixed(1));
  } catch {
    return null;
  }
}

registerTtsProvider("openai", async () => ({
  async synthesize({ text, voiceId, speed, outputPath }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 未設定，無法使用 openai TTS");
    }

    const timeoutMs = Number(process.env.NARRATION_TTS_TIMEOUT_MS || 120000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text,
          voice: voiceId || "nova",
          speed: speed || 1.0,
          response_format: "mp3",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI TTS ${res.status}: ${errText.slice(0, 300)}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

      const durationSeconds = await getAudioDurationSeconds(outputPath);
      return {
        outputPath,
        durationSeconds,
        costUsd: estimateTtsCostUsd(text),
        provider: "openai",
      };
    } finally {
      clearTimeout(timer);
    }
  },
}));

export {};
