import test from "node:test";
import assert from "node:assert/strict";
import { patchSlideHtml } from "./slide-patch.js";

const html = `<!DOCTYPE html><html><body><main>
  <section class="slide" data-title="角色路徑">
    <h2>先選一條路</h2>
    <div class="card"><div class="num">01</div><h3>主管／導入</h3><ol><li>主管五問</li></ol></div>
  </section>
  <section class="slide catalog" data-title="工具與 Vibe">
    <p class="kicker">CATALOG 1</p>
    <h2 class="tight">舊標題</h2>
    <table class="matrix"><tbody><tr><td><a href="/blog/chatgpt-work-vs-codex">ChatGPT Work vs Codex</a></td><td><span class="badge none">無</span></td></tr></tbody></table>
  </section>
</main></body></html>`;

test("patch updates the edited heading and keeps matrix links", () => {
  const next = patchSlideHtml(html, {
    index: 2,
    slideId: "s4",
    previous: { title: "工具與 Vibe", h2: "舊標題", kicker: "CATALOG 1" },
    next: { title: "工具與 Vibe", h2: "AI 工具應用", kicker: "CATALOG 1" },
  });
  assert.match(next, /AI 工具應用/);
  assert.match(next, /href="\/blog\/chatgpt-work-vs-codex"/);
  assert.match(next, /badge none/);
  assert.match(next, /id="s4"/);
});

test("empty card heading does not wipe existing card titles", () => {
  const next = patchSlideHtml(html, {
    index: 1,
    slideId: "s3",
    previous: { title: "角色路徑", h2: "先選一條路", cards: [{ heading: "", bullets: ["主管五問"] }] },
    next: { title: "角色路徑", h2: "先選一條路", cards: [{ heading: "", bullets: ["流程盤點"] }] },
  });
  assert.match(next, /主管／導入/);
  assert.match(next, /流程盤點/);
  assert.doesNotMatch(next, /主管五問/);
});
