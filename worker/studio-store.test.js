import test from "node:test";
import assert from "node:assert/strict";
import { ensureStudioDraft, publishStudioDraft, studioKeys, publicKeys } from "./studio-store.js";
import { handleStudioApi } from "./studio-api.js";

function memoryBucket() {
  const data = new Map();
  return {
    async get(key) {
      const item = data.get(key);
      if (!item) return null;
      return {
        customMetadata: item.customMetadata || {},
        async text() {
          return typeof item.body === "string" ? item.body : new TextDecoder().decode(item.body);
        },
        async arrayBuffer() {
          if (item.body instanceof ArrayBuffer) return item.body;
          return new TextEncoder().encode(String(item.body)).buffer;
        },
      };
    },
    async put(key, value, opts = {}) {
      data.set(key, { body: value, customMetadata: opts.customMetadata || {} });
    },
    async head(key) {
      return data.has(key) ? { key } : null;
    },
    async list({ prefix } = {}) {
      const objects = [...data.keys()].filter((key) => !prefix || key.startsWith(prefix)).map((key) => ({ key }));
      return { objects, truncated: false };
    },
    keys() {
      return [...data.keys()];
    },
  };
}

const deckHtml = `<!DOCTYPE html><html><body><main>
  <section class="slide" data-title="七分類"><h2>舊標題</h2>
    <table class="matrix"><tr><td><a href="/blog/chatgpt-work-vs-codex">ChatGPT</a></td></tr></table>
  </section>
</main></body></html>`;

const slides = {
  deckId: "demo-deck",
  sourceType: "html",
  slides: [{ slideId: "s1", index: 1, title: "七分類", h2: "舊標題", cards: [] }],
};

const narration = {
  deckId: "demo-deck",
  title: "示範",
  sourceType: "html",
  slides: [{ slideId: "s1", index: 1, title: "七分類", script: "", status: "empty", extractedContent: { headings: ["舊標題"] } }],
  voice: { provider: "openai", voiceId: "nova", speed: 1 },
};

test("first open copies static assets into the studio draft", async () => {
  const bucket = memoryBucket();
  const assets = {
    "/demo-deck.html": deckHtml,
    "/decks/demo-deck.slides.json": JSON.stringify(slides),
    "/narration/demo-deck.json": JSON.stringify(narration),
  };
  const first = await ensureStudioDraft(bucket, "demo-deck", async (path) => assets[path] || null);
  const second = await ensureStudioDraft(bucket, "demo-deck", async () => {
    throw new Error("should not fetch again");
  });
  assert.equal(first.seeded, true);
  assert.equal(second.seeded, false);
  assert.equal(await bucket.get(studioKeys("demo-deck").html).then((obj) => obj.text()), deckHtml);
});

test("publish copies the draft and skips preview audio", async () => {
  const bucket = memoryBucket();
  await bucket.put(studioKeys("demo-deck").html, "<html>draft</html>");
  await bucket.put(studioKeys("demo-deck").narration, JSON.stringify(narration));
  await bucket.put(studioKeys("demo-deck").audio("s01.mp3"), new Uint8Array([1, 2, 3]).buffer);
  await bucket.put(studioKeys("demo-deck").previewAudio("s01.mp3"), new Uint8Array([9]).buffer);
  const result = await publishStudioDraft(bucket, "demo-deck", {
    publishedAt: "2026-10-14T00:00:00.000Z",
    publishedUrl: "https://myppt.aidc.work/demo-deck.html",
  });
  assert.equal(result.copied, 1);
  assert.equal(await bucket.get(publicKeys("demo-deck").html).then((obj) => obj.text()), "<html>draft</html>");
  const published = JSON.parse(await bucket.get(publicKeys("demo-deck").narration).then((obj) => obj.text()));
  assert.equal(published.meta.publishedUrl, "https://myppt.aidc.work/demo-deck.html");
  assert.equal(bucket.keys().includes(publicKeys("demo-deck").audio("preview/s01.mp3")), false);
});

test("saving a slide patches that section and keeps the table link", async () => {
  const bucket = memoryBucket();
  const assets = {
    "/demo-deck.html": deckHtml,
    "/decks/demo-deck.slides.json": JSON.stringify(slides),
    "/narration/demo-deck.json": JSON.stringify(narration),
  };
  const env = {
    STUDIO: bucket,
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const body = assets[path];
        if (!body) return new Response("missing", { status: 404 });
        return new Response(body, { status: 200 });
      },
    },
  };
  const request = new Request("https://myppt.aidc.work/api/decks/demo-deck/slides/s1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ h2: "成長路徑", title: "七分類" }),
  });
  const response = await handleStudioApi(request, env, { email: "yjhwang59@gmail.com" }, "prompt");
  assert.equal(response.status, 200);
  const html = await bucket.get(studioKeys("demo-deck").html).then((obj) => obj.text());
  assert.match(html, /成長路徑/);
  assert.match(html, /href="\/blog\/chatgpt-work-vs-codex"/);
});
