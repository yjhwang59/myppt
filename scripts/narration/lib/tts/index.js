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

/** USD per 1M characters. ElevenLabs multilingual is about $300; OpenAI TTS is about $15. */
const TTS_USD_PER_MILLION_CHARS = {
  openai: 15,
  elevenlabs: 300,
};

/**
 * @param {string} text
 * @param {string} [provider]
 */
export function estimateTtsCostUsd(text, provider = "openai") {
  const rate = TTS_USD_PER_MILLION_CHARS[provider] ?? TTS_USD_PER_MILLION_CHARS.openai;
  const chars = (text || "").length;
  return Number(((chars / 1_000_000) * rate).toFixed(4));
}

export function estimateManifestTtsCost(manifest) {
  const manifestProvider = manifest.voice?.provider;
  return manifest.slides
    .filter((s) => s.script && ["approved", "audio_ready", "audio_failed"].includes(s.status))
    .reduce(
      (sum, s) => sum + estimateTtsCostUsd(s.script, s.voice?.provider || manifestProvider),
      0,
    );
}

/** `--force` re-synthesizes pages that already have audio. */
export function isSlideEligibleForTts(slide, { force = false, slideFilter } = {}) {
  if (slideFilter && slide.slideId !== slideFilter) return false;
  if (!slide.script) return false;
  if (force && slide.status === "audio_ready") return true;
  if (!force && slide.status === "audio_ready" && slide.audioUrl) return false;
  return ["approved", "audio_failed", "stale"].includes(slide.status);
}

/** Slide voice wins over the deck voice, then the env default. */
export function resolveNarrationProvider({ dryRun = false, slide, manifest, envProvider } = {}) {
  if (dryRun) return "dry-run";
  return (
    slide?.voice?.provider ||
    manifest?.voice?.provider ||
    envProvider ||
    process.env.NARRATION_TTS_PROVIDER ||
    "openai"
  );
}
