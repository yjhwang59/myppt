import { isValidDeckId, publicKeys, studioKeys } from "./studio-store.js";

function textResponse(body, contentType, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

async function objectBody(bucket, key, contentType) {
  const obj = await bucket.get(key);
  if (!obj) return null;
  if (contentType.startsWith("audio/")) {
    return new Response(await obj.arrayBuffer(), {
      headers: { "content-type": contentType, "cache-control": "no-store" },
    });
  }
  return textResponse(await obj.text(), contentType);
}

/**
 * Serve a published deck, its narration, or a logged-in draft preview.
 * Returns null when R2 has no override so static assets can answer.
 */
export async function serveStudioAsset(request, env, session) {
  if (!env.STUDIO) return null;
  const url = new URL(request.url);
  const { pathname } = url;

  const html = pathname.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/);
  if (html && isValidDeckId(html[1])) {
    const deckId = html[1];
    if (url.searchParams.get("draft") === "1") {
      if (!session) return textResponse("尚未登入", "text/plain; charset=utf-8", 401);
      return objectBody(env.STUDIO, studioKeys(deckId).html, "text/html; charset=utf-8");
    }
    return objectBody(env.STUDIO, publicKeys(deckId).html, "text/html; charset=utf-8");
  }

  const narration = pathname.match(/^\/narration\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/);
  if (narration && isValidDeckId(narration[1])) {
    return objectBody(env.STUDIO, publicKeys(narration[1]).narration, "application/json; charset=utf-8");
  }

  const preview = pathname.match(/^\/narration\/audio\/([a-z0-9]+(?:-[a-z0-9]+)*)\/preview\/(s\d+\.mp3)$/);
  if (preview && isValidDeckId(preview[1])) {
    if (!session) return textResponse("尚未登入", "text/plain; charset=utf-8", 401);
    return objectBody(env.STUDIO, studioKeys(preview[1]).previewAudio(preview[2]), "audio/mpeg");
  }

  const audio = pathname.match(/^\/narration\/audio\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(s\d+\.mp3)$/);
  if (audio && isValidDeckId(audio[1])) {
    return objectBody(env.STUDIO, publicKeys(audio[1]).audio(audio[2]), "audio/mpeg");
  }

  return null;
}
