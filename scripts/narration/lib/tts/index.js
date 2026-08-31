/**
 * TTS provider adapter interface.
 *
 * @typedef {Object} TtsSynthesisRequest
 * @property {string} text
 * @property {string} voiceId
 * @property {number} speed
 * @property {string} outputPath
 *
 * @typedef {Object} TtsSynthesisResult
 * @property {string} outputPath
 * @property {number|null} durationSeconds
 * @property {number} costUsd
 * @property {string} provider
 */

/** @type {Record<string, () => Promise<{ synthesize: (req: TtsSynthesisRequest) => Promise<TtsSynthesisResult> }>>} */
const providers = {};

export function registerTtsProvider(name, factory) {
  providers[name] = factory;
}

export async function getTtsAdapter(providerName) {
  const name = providerName || process.env.NARRATION_TTS_PROVIDER || "openai";
  const factory = providers[name];
  if (!factory) {
    throw new Error(`未知 TTS provider: ${name}`);
  }
  return factory();
}

/** Rough OpenAI TTS pricing: $15 / 1M chars */
export function estimateTtsCostUsd(text) {
  const chars = (text || "").length;
  return Number(((chars / 1_000_000) * 15).toFixed(4));
}

export function estimateManifestTtsCost(manifest) {
  return manifest.slides
    .filter((s) => s.script && ["approved", "audio_ready", "audio_failed"].includes(s.status))
    .reduce((sum, s) => sum + estimateTtsCostUsd(s.script), 0);
}
