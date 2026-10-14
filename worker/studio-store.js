export const VOICE_KEY = "studio/voice.json";
export const TRANSCRIPT_MAX_CHARS = 200_000;

const DECK_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidDeckId(deckId) {
  return typeof deckId === "string" && DECK_ID_RE.test(deckId) && deckId.length <= 80;
}

export function audioFileName(slideId) {
  const num = String(slideId || "").replace(/^s/i, "").padStart(2, "0");
  return `s${num}.mp3`;
}

export function studioKeys(deckId) {
  return {
    html: `studio/${deckId}/deck.html`,
    slides: `studio/${deckId}/slides.json`,
    narration: `studio/${deckId}/narration.json`,
    transcript: `studio/${deckId}/transcript.txt`,
    audio: (file) => `studio/${deckId}/audio/${file}`,
    previewAudio: (file) => `studio/${deckId}/audio/preview/${file}`,
    audioPrefix: `studio/${deckId}/audio/`,
  };
}

export function publicKeys(deckId) {
  return {
    html: `public/${deckId}.html`,
    narration: `public/narration/${deckId}.json`,
    audio: (file) => `public/narration/audio/${deckId}/${file}`,
  };
}

export async function readText(bucket, key) {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.text();
}

export async function readJson(bucket, key) {
  const text = await readText(bucket, key);
  if (!text) return null;
  return JSON.parse(text);
}

export async function writeText(bucket, key, text, contentType, customMetadata) {
  const options = { httpMetadata: { contentType } };
  if (customMetadata) options.customMetadata = customMetadata;
  await bucket.put(key, text, options);
}

export async function writeJson(bucket, key, value) {
  await writeText(bucket, key, `${JSON.stringify(value, null, 2)}\n`, "application/json; charset=utf-8");
}

export async function writeBytes(bucket, key, bytes, contentType) {
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
}

export async function ensureStudioDraft(bucket, deckId, fetchAsset) {
  const keys = studioKeys(deckId);
  if (await bucket.head(keys.html)) return { seeded: false };
  const html = await fetchAsset(`/${deckId}.html`);
  const narration = await fetchAsset(`/narration/${deckId}.json`);
  if (!html || !narration) {
    const error = new Error("讀不到簡報原稿");
    error.status = 404;
    throw error;
  }
  const slides = await fetchAsset(`/decks/${deckId}.slides.json`);
  await writeText(bucket, keys.html, html, "text/html; charset=utf-8");
  await writeText(
    bucket,
    keys.slides,
    slides || `${JSON.stringify({ deckId, slides: [] }, null, 2)}\n`,
    "application/json; charset=utf-8"
  );
  await writeText(bucket, keys.narration, narration, "application/json; charset=utf-8");
  return { seeded: true };
}

async function listAll(bucket, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    out.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export async function publishStudioDraft(bucket, deckId, { publishedAt, publishedUrl } = {}) {
  const keys = studioKeys(deckId);
  const pub = publicKeys(deckId);
  const html = await readText(bucket, keys.html);
  const narration = await readJson(bucket, keys.narration);
  if (!html || !narration) {
    const error = new Error("找不到工作室草稿");
    error.status = 404;
    throw error;
  }
  narration.meta = narration.meta || {};
  narration.meta.publishedAt = publishedAt || new Date().toISOString();
  narration.meta.publishedUrl = publishedUrl || null;
  await writeJson(bucket, keys.narration, narration);
  await writeText(bucket, pub.html, html, "text/html; charset=utf-8");
  await writeJson(bucket, pub.narration, narration);

  const audioObjects = await listAll(bucket, keys.audioPrefix);
  let copied = 0;
  for (const obj of audioObjects) {
    if (obj.key.includes("/preview/")) continue;
    const file = obj.key.slice(keys.audioPrefix.length);
    if (!file || file.endsWith("/")) continue;
    const body = await bucket.get(obj.key);
    if (!body) continue;
    await writeBytes(bucket, pub.audio(file), await body.arrayBuffer(), "audio/mpeg");
    copied += 1;
  }
  return { narration, copied };
}

export function combineSlides(deckData, manifest) {
  const byId = new Map((deckData?.slides || []).map((slide) => [slide.slideId, slide]));
  const rows = (manifest.slides || []).map((narration) => {
    const slide = byId.get(narration.slideId) || {
      slideId: narration.slideId,
      index: narration.index,
      title: narration.title,
      lead: narration.extractedContent?.lead || "",
      pageImageUrl: narration.extractedContent?.pageImageUrl || null,
    };
    return {
      ...slide,
      title: slide.title || narration.title,
      script: narration.script || "",
      status: narration.status || "empty",
      sourceHash: narration.sourceHash || null,
      audioUrl: narration.audioUrl || null,
      voice: narration.voice || manifest.voice,
      estimatedSeconds: narration.estimatedSeconds,
      pageImageUrl: slide.pageImageUrl || narration.extractedContent?.pageImageUrl || null,
    };
  });
  return {
    deckId: manifest.deckId,
    title: manifest.title || deckData?.title || manifest.deckId,
    sourceType: manifest.sourceType || deckData?.sourceType || "html",
    sourceFlavor: manifest.sourceFlavor || deckData?.sourceFlavor || null,
    slides: rows,
    voice: manifest.voice,
    modelVersion: manifest.modelVersion || null,
    meta: manifest.meta,
  };
}

export function transcriptPayload(text, updatedAt = null) {
  const value = String(text || "");
  return {
    text: value,
    charCount: value.length,
    truncated: false,
    updatedAt,
  };
}

export function clipTranscript(raw) {
  let text = String(raw ?? "");
  let truncated = false;
  if (text.length > TRANSCRIPT_MAX_CHARS) {
    text = text.slice(0, TRANSCRIPT_MAX_CHARS);
    truncated = true;
  }
  return { text, truncated, charCount: text.length };
}
