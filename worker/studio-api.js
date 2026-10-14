import { estimateSecondsFromScript } from "../scripts/narration/lib/extract.js";
import { hashContent } from "../scripts/narration/lib/hash.js";
import { generateScriptWithLlm } from "../scripts/narration/lib/llm.js";
import { resolveLlmModel } from "../server/lib/llm-models.js";
import {
  audioExtension,
  buildSpeechBody,
  customVoiceError,
  estimateMp3Duration,
  normalizeAudioMime,
  resolveStudioVoiceId,
} from "./speech.js";
import { patchSlideHtml } from "./slide-patch.js";
import {
  VOICE_KEY,
  audioFileName,
  clipTranscript,
  combineSlides,
  ensureStudioDraft,
  isValidDeckId,
  publishStudioDraft,
  readJson,
  studioKeys,
  transcriptPayload,
  writeBytes,
  writeJson,
  writeText,
} from "./studio-store.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(err) {
  const status = err.status || 500;
  return json({ error: err.message || "操作失敗" }, status);
}

async function fetchAsset(request, env, path) {
  const assetUrl = new URL(path, request.url);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString()));
  if (!res.ok) return null;
  return res.text();
}

async function loadDraft(bucket, deckId) {
  const keys = studioKeys(deckId);
  const [deckData, manifest] = await Promise.all([readJson(bucket, keys.slides), readJson(bucket, keys.narration)]);
  if (!manifest) {
    const error = new Error("找不到講稿 manifest");
    error.status = 404;
    throw error;
  }
  return { keys, deckData: deckData || { deckId, slides: [] }, manifest };
}

async function readVoiceProfile(bucket) {
  try {
    return await readJson(bucket, VOICE_KEY);
  } catch {
    return null;
  }
}

function requireKey(env) {
  if (!env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY 未設定，無法使用語音");
    error.status = 503;
    throw error;
  }
  return env.OPENAI_API_KEY;
}

function generationContext(manifest, index) {
  const slides = manifest.slides || [];
  const prev = index > 0 ? slides[index - 1] : null;
  const next = index < slides.length - 1 ? slides[index + 1] : null;
  const content = prev?.extractedContent || {};
  const parts = [];
  if (content.headings?.length) parts.push(content.headings.join(" — "));
  if (content.lead) parts.push(content.lead);
  if (content.callouts?.[0]) parts.push(content.callouts[0]);
  return {
    deckTitle: manifest.title || manifest.deckId || "簡報",
    slideTotal: slides.length,
    prevSlideSummary: parts.join(" ").slice(0, 120),
    nextSlideTitle: next?.title || "",
  };
}

function applyGeneratedScript(slide, result) {
  slide.script = result.script;
  slide.estimatedSeconds = result.estimatedSeconds;
  slide.generatedAt = new Date().toISOString();
  slide.generationNotes = result.generationNotes;
  slide.status = result.modelVersion?.startsWith("template") ? "pending_review" : "draft";
}

function markScriptEdited(slide) {
  slide.approvedAt = null;
  slide.approvedBy = null;
  slide.status = slide.status === "audio_ready" || slide.audioUrl ? "stale" : "pending_review";
}

function touchNarration(narration, slide) {
  const extracted = { ...(narration.extractedContent || {}) };
  if (slide.kicker != null) extracted.kicker = slide.kicker;
  if (slide.lead != null) extracted.lead = slide.lead;
  const headings = [slide.h1, slide.h2].map((item) => String(item || "").replace(/\n/g, " ").trim()).filter(Boolean);
  if (headings.length) extracted.headings = headings;
  if (Array.isArray(slide.callouts)) extracted.callouts = slide.callouts;
  if (Array.isArray(slide.cards)) {
    extracted.cards = slide.cards.map((card) => ({
      heading: card.heading || "",
      paragraph: card.paragraph || "",
      bullets: card.bullets || [],
    }));
  }
  narration.extractedContent = extracted;
  narration.title = slide.title || narration.title;
  const nextHash = hashContent(extracted);
  if (nextHash !== narration.sourceHash) {
    narration.sourceHash = nextHash;
    if (!["empty", "draft"].includes(narration.status)) narration.status = "stale";
  }
}

function applySlideFields(slide, incoming) {
  return {
    ...slide,
    title: incoming.title ?? slide.title,
    eyebrow: incoming.eyebrow ?? slide.eyebrow,
    kicker: incoming.kicker ?? slide.kicker,
    h1: incoming.h1 ?? slide.h1,
    h2: incoming.h2 ?? slide.h2,
    lead: incoming.lead ?? slide.lead,
    stamp: incoming.stamp ?? slide.stamp,
    cards: incoming.cards ?? slide.cards,
    flowSteps: incoming.flowSteps ?? slide.flowSteps,
    table: incoming.table ?? slide.table,
    callouts: incoming.callouts ?? slide.callouts,
  };
}

async function readAudioFile(request) {
  const form = await request.formData();
  const file = form.get("recording") || form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    const error = new Error("缺少音檔");
    error.status = 400;
    throw error;
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 10 * 1024 * 1024) {
    const error = new Error("音檔超過 10MB");
    error.status = 400;
    throw error;
  }
  return { bytes, mime: file.type || "audio/webm", name: file.name || "" };
}

async function openAIForm(env, url, build) {
  const apiKey = requireKey(env);
  const form = new FormData();
  build(form);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const friendly = customVoiceError(res.status, text);
    const error = new Error(friendly || data.error?.message || `OpenAI ${res.status}: ${text.slice(0, 300)}`);
    error.status = friendly ? 403 : 502;
    throw error;
  }
  return data;
}

async function synthesizeTo(env, voiceId, text, speed) {
  const apiKey = requireKey(env);
  const profile = await readVoiceProfile(env.STUDIO);
  const body = buildSpeechBody({
    text,
    voiceId: resolveStudioVoiceId(voiceId, profile?.voiceId),
    speed,
    customVoiceId: profile?.voiceId,
  });
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    const friendly = customVoiceError(res.status, errText);
    const error = new Error(friendly || `OpenAI TTS ${res.status}: ${errText.slice(0, 300)}`);
    error.status = friendly ? 403 : 502;
    throw error;
  }
  const audio = await res.arrayBuffer();
  return { audio, voiceId: body.voice?.id || body.voice, durationSeconds: estimateMp3Duration(audio.byteLength) };
}

export async function handleStudioApi(request, env, session, promptContract) {
  if (!session || !env.STUDIO) return null;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const { pathname } = url;

  try {
    if (method === "POST" && pathname === "/api/voice/consent") return await createConsent(request, env);
    if (method === "POST" && pathname === "/api/voice/sample") return await createSample(request, env);
  } catch (err) {
    return fail(err);
  }

  const match = pathname.match(/^\/api\/decks\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  const deckId = decodeURIComponent(match[1]);
  const rest = match[2] || "";
  if (!isStudioDeckRoute(method, rest)) return null;
  if (!isValidDeckId(deckId)) return json({ error: "deckId 格式無效" }, 400);

  try {
    await ensureStudioDraft(env.STUDIO, deckId, (path) => fetchAsset(request, env, path));
    return await routeDeck(request, env, promptContract, deckId, rest, method, url);
  } catch (err) {
    return fail(err);
  }
}

function isStudioDeckRoute(method, rest) {
  if (rest === "/source-transcript" && (method === "GET" || method === "PUT")) return true;
  if (rest === "/source-transcript/upload" && method === "POST") return true;
  if (rest === "/voice" && method === "PUT") return true;
  if (rest === "/llm-model" && method === "PUT") return true;
  if (rest === "/slides" && method === "GET") return true;
  if (rest === "/publish" && method === "POST") return true;
  if (/^\/slides\/[^/]+$/.test(rest) && method === "PUT") return true;
  if (/^\/slides\/[^/]+\/script$/.test(rest) && method === "PUT") return true;
  if (/^\/slides\/[^/]+\/(regenerate-script|preview-tts|synthesize)$/.test(rest) && method === "POST") return true;
  return false;
}

async function routeDeck(request, env, promptContract, deckId, rest, method, url) {
  const bucket = env.STUDIO;
  if (method === "GET" && rest === "/source-transcript") return getTranscript(bucket, deckId);
  if (method === "PUT" && rest === "/source-transcript") return putTranscript(request, bucket, deckId);
  if (method === "POST" && rest === "/source-transcript/upload") return uploadTranscript(request, bucket, deckId);
  if (method === "PUT" && rest === "/voice") return putVoice(request, bucket, deckId);
  if (method === "PUT" && rest === "/llm-model") return putModel(request, bucket, deckId);
  if (method === "GET" && rest === "/slides") return getSlides(bucket, deckId);
  if (method === "POST" && rest === "/publish") return publishDeck(request, env, deckId, url);

  const slide = rest.match(/^\/slides\/([^/]+)(\/.*)?$/);
  if (!slide) return null;
  const slideId = decodeURIComponent(slide[1]);
  const action = slide[2] || "";
  if (method === "PUT" && action === "") return putSlide(request, bucket, deckId, slideId);
  if (method === "PUT" && action === "/script") return putScript(request, bucket, deckId, slideId);
  if (method === "POST" && action === "/regenerate-script") {
    return regenerateScript(request, env, promptContract, deckId, slideId);
  }
  if (method === "POST" && action === "/preview-tts") return previewTts(request, env, deckId, slideId);
  if (method === "POST" && action === "/synthesize") return synthesizeSlide(request, env, deckId, slideId);
  return null;
}

async function getTranscript(bucket, deckId) {
  const obj = await bucket.get(studioKeys(deckId).transcript);
  if (!obj) return json(transcriptPayload(""));
  const text = await obj.text();
  return json(transcriptPayload(text, obj.customMetadata?.updatedAt || null));
}

async function putTranscript(request, bucket, deckId) {
  const body = await request.json().catch(() => ({}));
  const clipped = clipTranscript(body.text);
  const updatedAt = new Date().toISOString();
  await writeText(bucket, studioKeys(deckId).transcript, clipped.text, "text/plain; charset=utf-8", { updatedAt });
  return json({ ...transcriptPayload(clipped.text, updatedAt), truncated: clipped.truncated });
}

async function uploadTranscript(request, bucket, deckId) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.text !== "function") {
    const error = new Error("缺少文字稿");
    error.status = 400;
    throw error;
  }
  const clipped = clipTranscript(await file.text());
  const updatedAt = new Date().toISOString();
  await writeText(bucket, studioKeys(deckId).transcript, clipped.text, "text/plain; charset=utf-8", { updatedAt });
  return json({ ...transcriptPayload(clipped.text, updatedAt), truncated: clipped.truncated });
}

async function putVoice(request, bucket, deckId) {
  const body = await request.json().catch(() => ({}));
  const { manifest, keys } = await loadDraft(bucket, deckId);
  const profile = await readVoiceProfile(bucket);
  const voiceId = resolveStudioVoiceId(body.voiceId, profile?.voiceId);
  manifest.voice = { ...(manifest.voice || {}), provider: "openai", voiceId, speed: Number(body.speed) || manifest.voice?.speed || 1 };
  await writeJson(bucket, keys.narration, manifest);
  return json({ ok: true, voice: manifest.voice });
}

async function putModel(request, bucket, deckId) {
  const body = await request.json().catch(() => ({}));
  const { manifest, keys } = await loadDraft(bucket, deckId);
  manifest.modelVersion = resolveLlmModel(body.model, manifest.modelVersion);
  await writeJson(bucket, keys.narration, manifest);
  return json({ ok: true, modelVersion: manifest.modelVersion });
}

async function getSlides(bucket, deckId) {
  const { deckData, manifest } = await loadDraft(bucket, deckId);
  return json(combineSlides(deckData, manifest));
}

async function putSlide(request, bucket, deckId, slideId) {
  const incoming = await request.json().catch(() => ({}));
  const { deckData, manifest, keys } = await loadDraft(bucket, deckId);
  if ((manifest.sourceType || deckData.sourceType) === "pdf") {
    const error = new Error("PDF 簡報不支援編輯投影片欄位");
    error.status = 400;
    throw error;
  }
  const idx = (deckData.slides || []).findIndex((slide) => slide.slideId === slideId);
  if (idx < 0) {
    const error = new Error("slide not found");
    error.status = 404;
    throw error;
  }
  const previous = deckData.slides[idx];
  const next = applySlideFields(previous, incoming);
  deckData.slides[idx] = next;
  const html = await bucket.get(keys.html);
  const currentHtml = html ? await html.text() : "";
  const patched = patchSlideHtml(currentHtml, {
    index: next.index || idx + 1,
    slideId,
    previous,
    next,
  });
  await writeText(bucket, keys.html, patched, "text/html; charset=utf-8");
  await writeJson(bucket, keys.slides, deckData);
  const narration = manifest.slides.find((slide) => slide.slideId === slideId);
  if (narration) touchNarration(narration, next);
  await writeJson(bucket, keys.narration, manifest);
  return json({ ok: true, slide: next, manifestStatus: narration?.status || null });
}

async function putScript(request, bucket, deckId, slideId) {
  const body = await request.json().catch(() => ({}));
  const { manifest, keys } = await loadDraft(bucket, deckId);
  const slide = manifest.slides.find((item) => item.slideId === slideId);
  if (!slide) {
    const error = new Error("narration slide not found");
    error.status = 404;
    throw error;
  }
  slide.script = body.script ?? "";
  slide.estimatedSeconds = estimateSecondsFromScript(slide.script);
  markScriptEdited(slide);
  await writeJson(bucket, keys.narration, manifest);
  return json({ ok: true, slide });
}

async function regenerateScript(request, env, promptContract, deckId, slideId) {
  const body = await request.json().catch(() => ({}));
  const bucket = env.STUDIO;
  const { manifest, keys } = await loadDraft(bucket, deckId);
  const idx = manifest.slides.findIndex((item) => item.slideId === slideId);
  if (idx < 0) {
    const error = new Error("slide not found");
    error.status = 404;
    throw error;
  }
  const slide = manifest.slides[idx];
  const previousScript = slide.script || "";
  const hadAudio = Boolean(slide.audioUrl) || slide.status === "audio_ready";
  const transcriptObj = await bucket.get(keys.transcript);
  const sourceTranscript = transcriptObj ? await transcriptObj.text() : "";
  const result = await generateScriptWithLlm(slide, generationContext(manifest, idx), {
    apiKey: env.OPENAI_API_KEY,
    model: resolveLlmModel(body.model, manifest.modelVersion),
    sourceTranscript,
    promptContract,
    sourceType: manifest.sourceType || "html",
    timeoutMs: 50000,
    maxRetries: 1,
  });
  applyGeneratedScript(slide, result);
  if (hadAudio) {
    markScriptEdited(slide);
    slide.script = result.script;
    slide.estimatedSeconds = result.estimatedSeconds;
    slide.generatedAt = new Date().toISOString();
    slide.generationNotes = result.generationNotes;
    slide.status = "pending_review";
  }
  if (result.modelVersion && !String(result.modelVersion).startsWith("template")) {
    manifest.modelVersion = result.modelVersion;
  }
  await writeJson(bucket, keys.narration, manifest);
  return json({ ok: true, slide, previousScript, generation: result });
}

async function previewTts(request, env, deckId, slideId) {
  const body = await request.json().catch(() => ({}));
  const { manifest } = await loadDraft(env.STUDIO, deckId);
  const slide = manifest.slides.find((item) => item.slideId === slideId);
  if (!slide) {
    const error = new Error("slide not found");
    error.status = 404;
    throw error;
  }
  const script = body.script ?? slide.script;
  if (!script) {
    const error = new Error("script is empty");
    error.status = 400;
    throw error;
  }
  const profile = await readVoiceProfile(env.STUDIO);
  const voiceId = resolveStudioVoiceId(body.voiceId, profile?.voiceId);
  const result = await synthesizeTo(env, voiceId, script, body.speed || slide.voice?.speed || 1);
  const file = audioFileName(slideId);
  await writeBytes(env.STUDIO, studioKeys(deckId).previewAudio(file), result.audio, "audio/mpeg");
  return json({
    ok: true,
    previewUrl: `narration/audio/${deckId}/preview/${file}?t=${Date.now()}`,
    voiceId: result.voiceId,
    durationSeconds: result.durationSeconds,
  });
}

async function synthesizeSlide(request, env, deckId, slideId) {
  const body = await request.json().catch(() => ({}));
  const bucket = env.STUDIO;
  const { manifest, keys } = await loadDraft(bucket, deckId);
  const slide = manifest.slides.find((item) => item.slideId === slideId);
  if (!slide) {
    const error = new Error("slide not found");
    error.status = 404;
    throw error;
  }
  if (!slide.script) {
    const error = new Error("script is empty");
    error.status = 400;
    throw error;
  }
  const profile = await readVoiceProfile(bucket);
  const voiceId = resolveStudioVoiceId(body.voiceId, profile?.voiceId);
  try {
    const result = await synthesizeTo(env, voiceId, slide.script, body.speed || 1);
    const file = audioFileName(slideId);
    await writeBytes(bucket, keys.audio(file), result.audio, "audio/mpeg");
    slide.voice = { ...(slide.voice || manifest.voice), provider: "openai", voiceId: result.voiceId, speed: Number(body.speed) || 1 };
    slide.status = "audio_ready";
    slide.audioUrl = `narration/audio/${deckId}/${file}`;
    slide.audioDurationSeconds = result.durationSeconds;
    slide.approvedAt = new Date().toISOString();
    slide.approvedBy = "admin-ui";
    manifest.voice = { ...(manifest.voice || {}), provider: "openai", voiceId: result.voiceId };
    await writeJson(bucket, keys.narration, manifest);
    return json({ ok: true, slide, voiceId: result.voiceId });
  } catch (err) {
    slide.status = "audio_failed";
    slide.generationNotes = [slide.generationNotes, err.message].filter(Boolean).join(" | ");
    await writeJson(bucket, keys.narration, manifest);
    throw err;
  }
}

async function publishDeck(request, env, deckId, url) {
  const body = await request.json().catch(() => ({}));
  const { manifest } = await loadDraft(env.STUDIO, deckId);
  const missingScripts = manifest.slides.filter((slide) => !slide.script).length;
  const missingAudio = manifest.slides.filter((slide) => slide.status !== "audio_ready").length;
  if ((missingScripts > 0 || missingAudio > 0) && !body.force) {
    return json(
      {
        error: "尚未準備完整",
        warnings: { missingScripts, missingAudio },
        hint: "傳 force:true 仍可發布",
      },
      400
    );
  }
  const host = url.hostname;
  const origin =
    host === "localhost" || host === "127.0.0.1" || host.endsWith("aidc.work")
      ? "https://myppt.aidc.work"
      : url.origin;
  const publishedUrl = `${origin}/${deckId}.html`;
  const result = await publishStudioDraft(env.STUDIO, deckId, {
    publishedAt: new Date().toISOString(),
    publishedUrl,
  });
  return json({ ok: true, url: result.narration.meta.publishedUrl, copiedAudio: result.copied });
}

async function createConsent(request, env) {
  const { bytes, mime } = await readAudioFile(request);
  if (bytes.byteLength < 1000) {
    const error = new Error("同意句太短，請完整唸出畫面中的句子");
    error.status = 400;
    throw error;
  }
  const type = normalizeAudioMime(mime);
  const blob = new Blob([bytes], { type });
  const data = await openAIForm(env, "https://api.openai.com/v1/audio/voice_consents", (form) => {
    form.set("name", "myppt-consent");
    form.set("language", "zh");
    form.set("recording", blob, `consent.${audioExtension(type)}`);
  });
  const profile = (await readVoiceProfile(env.STUDIO)) || { name: "我的聲音" };
  profile.consentId = data.id;
  profile.updatedAt = new Date().toISOString();
  await writeJson(env.STUDIO, VOICE_KEY, profile);
  return json({ ok: true, consentId: data.id });
}

async function createSample(request, env) {
  const profile = await readVoiceProfile(env.STUDIO);
  if (!profile?.consentId) {
    const error = new Error("請先錄同意句");
    error.status = 400;
    throw error;
  }
  const { bytes, mime } = await readAudioFile(request);
  if (bytes.byteLength < 8000) {
    const error = new Error("樣本太短，請錄至少 10 秒自然講話");
    error.status = 400;
    throw error;
  }
  const type = normalizeAudioMime(mime);
  const blob = new Blob([bytes], { type });
  const data = await openAIForm(env, "https://api.openai.com/v1/audio/voices", (form) => {
    form.set("name", "我的聲音");
    form.set("consent", profile.consentId);
    form.set("audio_sample", blob, `sample.${audioExtension(type)}`);
  });
  profile.voiceId = data.id;
  profile.name = "我的聲音";
  profile.updatedAt = new Date().toISOString();
  await writeJson(env.STUDIO, VOICE_KEY, profile);
  return json({ ok: true, voiceId: data.id, label: profile.name });
}

export async function customVoiceOption(env) {
  if (!env.STUDIO) return null;
  const profile = await readVoiceProfile(env.STUDIO);
  if (!profile?.voiceId) return null;
  return { id: profile.voiceId, label: profile.name || "我的聲音", custom: true };
}
