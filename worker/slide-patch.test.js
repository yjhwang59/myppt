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

const richHtml = `<!DOCTYPE html><html><body><main>
  <section class="slide" id="s1" data-title="流程頁">
    <p class="eyebrow">01</p>
    <h2>舊流程</h2>
    <div class="flow">
      <div class="flow-step"><strong>收集</strong><p class="flow-desc">舊說明</p></div>
      <div class="flow-arrow"></div>
      <div class="flow-step"><strong>分析</strong><p class="flow-desc">保留</p></div>
    </div>
    <table class="table"><tr><th>欄</th><th>值</th></tr><tr><td>舊列</td><td>1</td></tr></table>
    <table class="matrix"><tr><td><a href="/keep">連結</a></td></tr></table>
  </section>
  <section class="slide" id="s2" data-title="階段">
    <div class="phase"><strong>上線</strong><p>舊內文</p></div>
    <div class="fact"><b>8</b><span>店</span></div>
    <article class="card"><strong>卡片</strong><p>舊段落</p><ul><li>舊項</li></ul></article>
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
  assert.match(next, /先選一條路/);
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

test("patch updates flow, table, eyebrow, and leaves the other slide", () => {
  const next = patchSlideHtml(richHtml, {
    index: 1,
    previous: {
      eyebrow: "01",
      h2: "舊流程",
      flowSteps: [
        { title: "收集", description: "舊說明" },
        { title: "分析", description: "保留" },
      ],
      table: [
        ["欄", "值"],
        ["舊列", "1"],
      ],
    },
    next: {
      eyebrow: "02",
      h2: "新流程",
      flowSteps: [
        { title: "盤點", description: "新說明" },
        { title: "分析", description: "保留" },
      ],
      table: [
        ["欄", "值"],
        ["新列", "1"],
      ],
    },
  });
  assert.match(next, /<p class="eyebrow">02<\/p>/);
  assert.match(next, /新流程/);
  assert.match(next, /盤點/);
  assert.match(next, /新說明/);
  assert.match(next, /分析/);
  assert.match(next, /class="flow-arrow"/);
  assert.match(next, /新列/);
  assert.match(next, /href="\/keep"/);
  assert.match(next, /舊內文/);
  assert.doesNotMatch(next, /舊流程/);
  assert.doesNotMatch(next, /舊說明/);
  assert.doesNotMatch(next, /舊列/);
});

test("patch updates phases, facts, and card copy without adding nodes", () => {
  const next = patchSlideHtml(richHtml, {
    index: 2,
    previous: {
      phases: [{ heading: "上線", paragraph: "舊內文" }],
      facts: [{ value: "8", label: "店" }],
      cards: [{ heading: "卡片", paragraph: "舊段落", bullets: ["舊項"] }],
    },
    next: {
      phases: [{ heading: "驗收", paragraph: "新內文" }],
      facts: [{ value: "12", label: "門市" }],
      cards: [{ heading: "卡片", paragraph: "新段落", bullets: ["新項"] }],
    },
  });
  assert.match(next, /驗收/);
  assert.match(next, /新內文/);
  assert.match(next, />12</);
  assert.match(next, /門市/);
  assert.match(next, /新段落/);
  assert.match(next, /新項/);
  assert.match(next, /舊流程/);
  assert.match(next, /href="\/keep"/);
  assert.doesNotMatch(next, /舊內文/);
  assert.doesNotMatch(next, /舊段落/);
  assert.equal(next.match(/class="phase"/g).length, 1);
  assert.equal(next.match(/class="card"/g).length, 1);
});
