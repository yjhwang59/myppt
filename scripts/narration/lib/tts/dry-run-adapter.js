import fs from "node:fs";
import path from "node:path";
import { registerTtsProvider } from "./index.js";

/** Writes a minimal silent MP3 placeholder for dry-run / offline validation. */
registerTtsProvider("dry-run", async () => ({
  async synthesize({ text, outputPath }) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    // Minimal valid-ish stub: empty file marked as dry-run (player skips if zero duration)
    const stub = Buffer.from(
      "DRY_RUN_TTS_PLACEHOLDER\n" + (text || "").slice(0, 200),
      "utf8"
    );
    fs.writeFileSync(outputPath, stub);
    const approxDuration = Math.max(1, Math.round((text || "").length / 12));
    return {
      outputPath,
      durationSeconds: approxDuration,
      costUsd: 0,
      provider: "dry-run",
    };
  },
}));

export {};
