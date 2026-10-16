#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import {
  RECORDINGS_DIR,
  applyClonedVoice,
  buildCloneForm,
  formatElevenLabsError,
  listRecordingFiles,
  selectClonedVoice,
  writeEnvAssignment,
} from "./lib/clone-voice.js";
import { readManifest, writeManifest } from "./lib/manifest.js";
import { REPO_ROOT, isValidDeckId, manifestPath } from "./lib/paths.js";

const args = process.argv.slice(2);
const nameArg = args.find((a) => a.startsWith("--name="));
const name = nameArg ? nameArg.split("=").slice(1).join("=") : "myppt-speaker";
const description =
  args.find((a) => a.startsWith("--description="))?.split("=").slice(1).join("=") ||
  "Cloned speaker for myppt narration";
const deckId = args.find((a) => a.startsWith("--deck="))?.split("=")[1];
const denoise = args.includes("--denoise");
const applyOnly = args.includes("--apply-only");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (deckId && !isValidDeckId(deckId)) {
  fail(`無效的 deck id: ${deckId}`);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
let voiceId = String(process.env.ELEVENLABS_VOICE_ID || "").trim();

function saveVoiceEnv(id) {
  writeEnvAssignment(path.join(REPO_ROOT, ".env"), "ELEVENLABS_VOICE_ID", id);
  if (!process.env.ELEVENLABS_MODEL_ID) {
    writeEnvAssignment(path.join(REPO_ROOT, ".env"), "ELEVENLABS_MODEL_ID", "eleven_multilingual_v2");
  }
}

async function listAccountVoices(key) {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key },
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(formatElevenLabsError(res.status, raw));
  const body = JSON.parse(raw);
  return body.voices || [];
}

function describeMatches(matches) {
  return matches.map((voice) => `- ${voice.name} (${voice.voice_id})`).join("\n");
}

if (!applyOnly) {
  if (!apiKey) {
    fail("ELEVENLABS_API_KEY 未設定。請在 .env 填入 ElevenLabs API key（需付費方案才能 Instant Voice Clone）。");
  }

  let voices = [];
  let listError = null;
  try {
    voices = await listAccountVoices(apiKey);
  } catch (err) {
    listError = err;
  }

  const known = voices.some((voice) => voice.voice_id === voiceId);
  const selected = selectClonedVoice(voices, {
    voiceId: known ? voiceId : "",
    name: nameArg ? name : "",
  });
  const files = listRecordingFiles();

  if (!files.length) {
    if (listError) fail(listError.message);
    if (!selected.voice) {
      const listed = describeMatches(selected.matches || []);
      const extra =
        selected.error === "ambiguous" || selected.error === "ambiguous-name"
          ? `帳戶裡有多個複製聲音，請用 --name=聲音名稱 指定其中一個：\n${listed}`
          : selected.error === "name-not-found"
            ? `找不到名稱為「${name}」的複製聲音。${listed ? `帳戶裡有：\n${listed}` : "帳戶裡沒有複製聲音。"}`
            : `recordings/ 沒有音檔，帳戶裡也沒有已建立的複製聲音。請放入 1–5 分鐘、單人、無背景音樂的錄音（mp3 / wav / m4a），路徑: ${RECORDINGS_DIR}`;
      fail(extra);
    }
    if (!known && voiceId) {
      console.log("略過 .env 裡找不到的 ELEVENLABS_VOICE_ID。");
    }
    voiceId = selected.voice.voice_id;
    saveVoiceEnv(voiceId);
    console.log(`✓ 沿用已建立的聲音「${selected.voice.name}」voice_id=${voiceId}`);
    console.log("已寫入 .env 的 ELEVENLABS_VOICE_ID。");
  } else {
    console.log(`上傳 ${files.length} 個錄音，建立聲音「${name}」…`);
    const timeoutMs = Number(process.env.NARRATION_TTS_TIMEOUT_MS || 120000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: buildCloneForm(files, { name, description, denoise }),
        signal: controller.signal,
      });
      const raw = await res.text();
      if (!res.ok) fail(formatElevenLabsError(res.status, raw));
      const body = JSON.parse(raw);
      voiceId = body.voice_id;
      if (!voiceId) fail(`ElevenLabs 沒有回傳 voice_id: ${raw.slice(0, 300)}`);
      saveVoiceEnv(voiceId);
      console.log(`✓ voice_id=${voiceId}`);
      if (body.requires_verification) {
        console.log("此聲音需要在 ElevenLabs 後台完成本人驗證後才能合成。");
      }
      console.log("已寫入 .env 的 ELEVENLABS_VOICE_ID。");
    } finally {
      clearTimeout(timer);
    }
  }
} else if (!voiceId) {
  fail("ELEVENLABS_VOICE_ID 未設定，無法 --apply-only。");
}

if (deckId) {
  const mPath = manifestPath(deckId);
  const manifest = readManifest(mPath);
  if (!manifest) fail(`找不到 manifest: ${mPath}`);
  applyClonedVoice(manifest, voiceId);
  writeManifest(manifest, mPath);
  console.log(`✓ ${deckId} 的 voice 已改為 elevenlabs / ${voiceId}（含每一頁 slide.voice）`);
}
