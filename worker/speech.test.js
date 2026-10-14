import test from "node:test";
import assert from "node:assert/strict";
import { buildSpeechBody, customVoiceError, normalizeAudioMime } from "./speech.js";

test("preset voice uses tts-1 and a voice name", () => {
  const body = buildSpeechBody({ text: "你好", voiceId: "nova", speed: 1 });
  assert.equal(body.model, "tts-1");
  assert.equal(body.voice, "nova");
  assert.equal(body.response_format, "mp3");
});

test("cloned voice uses an id object", () => {
  const body = buildSpeechBody({
    text: "你好",
    voiceId: "voice_abc",
    customVoiceId: "voice_abc",
  });
  assert.equal(body.model, "gpt-4o-mini-tts");
  assert.deepEqual(body.voice, { id: "voice_abc" });
  assert.equal(body.voice === "nova", false);
});

test("browser webm codec label is stored as audio/webm", () => {
  assert.equal(normalizeAudioMime("audio/webm;codecs=opus"), "audio/webm");
});

test("custom voice access errors stay readable", () => {
  const message = customVoiceError(403, "custom voice is limited to eligible customers");
  assert.match(message, /尚未開通 Custom Voices/);
  assert.equal(customVoiceError(500, "upstream timeout"), null);
});
