import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyClonedVoice,
  buildCloneForm,
  formatElevenLabsError,
  listRecordingFiles,
  resolveSynthesisTarget,
  selectClonedVoice,
  upsertEnvAssignment,
} from "../clone-voice.js";
import {
  buildElevenLabsTtsBody,
  clampElevenLabsSpeed,
  resolveElevenLabsVoiceId,
} from "./elevenlabs-adapter.js";
import {
  estimateManifestTtsCost,
  estimateTtsCostUsd,
  getTtsAdapter,
  isSlideEligibleForTts,
  resolveNarrationProvider,
} from "./index.js";

test("cost follows provider", () => {
  const text = "a".repeat(10_000);
  assert.equal(estimateTtsCostUsd(text, "openai"), 0.15);
  assert.equal(estimateTtsCostUsd(text, "elevenlabs"), 3);
  assert.equal(estimateTtsCostUsd(text), 0.15);
  assert.equal(
    estimateManifestTtsCost({
      voice: { provider: "elevenlabs", voiceId: "v" },
      slides: [{ script: text, status: "approved", voice: { provider: "openai", voiceId: "nova" } }],
    }),
    0.15,
  );
});

test("force includes pages that already have audio", () => {
  const ready = { slideId: "s1", script: "你好", status: "audio_ready", audioUrl: "narration/audio/x/s01.mp3" };
  assert.equal(isSlideEligibleForTts(ready, { force: false }), false);
  assert.equal(isSlideEligibleForTts(ready, { force: true }), true);
  assert.equal(isSlideEligibleForTts(ready, { force: true, slideFilter: "s2" }), false);
});

test("resolveNarrationProvider prefers the slide voice", () => {
  assert.equal(
    resolveNarrationProvider({
      slide: { voice: { provider: "elevenlabs" } },
      manifest: { voice: { provider: "openai" } },
      envProvider: "openai",
    }),
    "elevenlabs",
  );
  assert.equal(resolveNarrationProvider({ dryRun: true, manifest: { voice: { provider: "elevenlabs" } } }), "dry-run");
});

test("elevenlabs speed is clamped and body uses multilingual model", () => {
  assert.equal(clampElevenLabsSpeed(0.2), 0.7);
  assert.equal(clampElevenLabsSpeed(1.8), 1.2);
  assert.equal(clampElevenLabsSpeed(1), 1);
  const body = buildElevenLabsTtsBody({ text: "你好", speed: 1 });
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.voice_settings.speed, 1);
  assert.equal(body.text, "你好");
});

test("voice id falls back to env", () => {
  const prev = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_VOICE_ID = "from-env";
  try {
    assert.equal(resolveElevenLabsVoiceId(""), "from-env");
    assert.equal(resolveElevenLabsVoiceId("explicit"), "explicit");
  } finally {
    if (prev === undefined) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = prev;
  }
});

test("openai preset requests do not replace a cloned voice", () => {
  const manifest = { voice: { provider: "elevenlabs", voiceId: "clone1", speed: 1 } };
  const kept = resolveSynthesisTarget({ manifest, requestedVoiceId: "echo" });
  assert.equal(kept.provider, "elevenlabs");
  assert.equal(kept.voiceId, "clone1");
  assert.equal(resolveSynthesisTarget({ manifest: { voice: { provider: "openai", voiceId: "nova" } } }), null);
});

test("applyClonedVoice updates deck and every slide", () => {
  const manifest = {
    voice: { provider: "openai", voiceId: "echo", speed: 1 },
    slides: [
      { slideId: "s1", voice: { provider: "openai", voiceId: "echo", speed: 1.1 } },
      { slideId: "s2" },
    ],
  };
  applyClonedVoice(manifest, "voice123");
  assert.equal(manifest.voice.provider, "elevenlabs");
  assert.equal(manifest.voice.voiceId, "voice123");
  assert.equal(manifest.slides[0].voice.speed, 1.1);
  assert.equal(manifest.slides[1].voice.provider, "elevenlabs");
  assert.equal(manifest.slides[1].voice.voiceId, "voice123");
});

test("upsertEnvAssignment replaces or appends", () => {
  assert.equal(upsertEnvAssignment("A=1\n", "B", "2"), "A=1\nB=2\n");
  assert.equal(upsertEnvAssignment("A=1\nB=old\n", "B", "new"), "A=1\nB=new\n");
});

test("selectClonedVoice prefers a known id, then the only clone", () => {
  const premade = { voice_id: "premade", name: "Sarah", category: "premade" };
  const mine = { voice_id: "cloneA", name: "Jack", category: "cloned" };
  assert.equal(selectClonedVoice([premade, mine], { voiceId: "missing" }).voice.voice_id, "cloneA");
  assert.equal(selectClonedVoice([premade, mine], { voiceId: "premade" }).reason, "id");
  assert.equal(selectClonedVoice([premade, mine], { name: "Jack" }).reason, "name");
  assert.equal(selectClonedVoice([premade, mine], { name: "沒有這個人" }).error, "name-not-found");
  const many = selectClonedVoice(
    [
      { voice_id: "a", name: "A", category: "cloned" },
      { voice_id: "b", name: "B", category: "professional" },
    ],
    {},
  );
  assert.equal(many.error, "ambiguous");
  assert.equal(many.matches.length, 2);
  assert.equal(selectClonedVoice([premade]).error, "none");
});

test("formatElevenLabsError explains missing permissions", () => {
  const raw = JSON.stringify({
    detail: { status: "missing_permissions", message: "missing voices_write" },
  });
  assert.match(formatElevenLabsError(401, raw), /權限不足/);
  const validation = JSON.stringify({ detail: [{ msg: "Field required" }] });
  assert.equal(formatElevenLabsError(422, validation), "ElevenLabs 422: Field required");
});

test("buildCloneForm names the audio and skips denoise by default", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clone-form-"));
  const filePath = path.join(dir, "me.mp3");
  fs.writeFileSync(filePath, Buffer.from("audio"));
  const form = buildCloneForm([filePath], { name: "講者", description: "中文" });
  const file = form.get("files");
  assert.equal(form.get("name"), "講者");
  assert.equal(form.get("remove_background_noise"), null);
  assert.equal(file.name, "me.mp3");
  assert.equal(form.get("labels"), JSON.stringify({ language: "zh" }));
  const denoised = buildCloneForm([filePath], { name: "講者", denoise: true });
  assert.equal(denoised.get("remove_background_noise"), "true");
});

test("listRecordingFiles ignores notes and keeps audio", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recordings-"));
  fs.writeFileSync(path.join(dir, "README.md"), "x");
  fs.writeFileSync(path.join(dir, "me.mp3"), "audio");
  fs.writeFileSync(path.join(dir, ".hidden.wav"), "nope");
  const files = listRecordingFiles(dir);
  assert.deepEqual(files.map((f) => path.basename(f)), ["me.mp3"]);
});

test("elevenlabs synthesize writes the mp3 body", async () => {
  const prevKey = process.env.ELEVENLABS_API_KEY;
  const prevFetch = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = "test-key";
  const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
  globalThis.fetch = async (url, opts) => {
    assert.match(String(url), /\/v1\/text-to-speech\/voice123\?output_format=mp3_44100_128/);
    assert.equal(opts.headers["xi-api-key"], "test-key");
    const body = JSON.parse(opts.body);
    assert.equal(body.text, "你好");
    assert.equal(body.model_id, "eleven_multilingual_v2");
    return new Response(mp3, { status: 200 });
  };
  const outputPath = path.join(os.tmpdir(), `el-tts-${Date.now()}.mp3`);
  try {
    const adapter = await getTtsAdapter("elevenlabs");
    const result = await adapter.synthesize({
      text: "你好",
      voiceId: "voice123",
      speed: 1,
      outputPath,
    });
    assert.equal(result.provider, "elevenlabs");
    assert.equal(result.costUsd, estimateTtsCostUsd("你好", "elevenlabs"));
    assert.equal(fs.readFileSync(outputPath).length, mp3.length);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = prevKey;
    fs.rmSync(outputPath, { force: true });
  }
});
