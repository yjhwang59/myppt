import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSourceFlavor,
  extractDeckSlides,
  shouldSkipHtmlPatch,
} from "./extract.js";

const FYH_FIXTURE = `<!doctype html>
<html lang="zh-Hant">
<head>
  <link rel="stylesheet" href="/docs/assets/deck/deck-chrome.css" />
  <title>營運通系統現況</title>
</head>
<body>
<main id="deck">
  <section class="slide hero" id="s1" data-title="封面">
    <div class="hero-copy"><h2>福圓號營運通</h2></div>
    <p class="lead">平行作業</p>
  </section>
  <section class="slide" id="s4" data-title="四狀態">
    <p class="eyebrow">04 / 狀態定義</p>
    <h2>用切換進度說話</h2>
    <div class="phase-line">
      <div class="phase g"><strong>正式上線</strong><p>已在用</p></div>
      <div class="phase y"><strong>平行作業</strong><p>雙軌</p></div>
      <div class="phase b"><strong>開發中</strong><p>閉環未完成</p></div>
      <div class="phase r"><strong>評估中</strong><p>不可宣稱時程</p></div>
    </div>
    <footer>庫存不因驗收升等</footer>
  </section>
  <section class="slide" id="s5" data-title="總覽">
    <h2>16 項</h2>
    <div class="facts">
      <div class="fact g"><b>8</b><span>正式上線</span></div>
      <div class="fact y"><b>2</b><span>平行作業</span></div>
      <div class="fact b"><b>3</b><span>開發中</span></div>
      <div class="fact r"><b>3</b><span>評估中</span></div>
    </div>
    <p class="op-url"><span class="op-label">入口</span><a href="/shop">/shop</a></p>
  </section>
</main>
</body>
</html>`;

test("detectSourceFlavor recognizes deck-chrome", () => {
  assert.equal(detectSourceFlavor(FYH_FIXTURE), "fyh-deck-chrome");
  assert.equal(detectSourceFlavor('<section class="slide"></section>'), "ai-eip-native");
});

test("shouldSkipHtmlPatch for fyh-deck-chrome", () => {
  assert.equal(shouldSkipHtmlPatch({ sourceFlavor: "fyh-deck-chrome" }, ""), true);
  assert.equal(shouldSkipHtmlPatch({ sourceType: "pdf" }, ""), true);
  assert.equal(shouldSkipHtmlPatch({ sourceType: "html" }, FYH_FIXTURE), true);
  assert.equal(shouldSkipHtmlPatch({ sourceType: "html" }, '<main id="deck"></main>'), false);
});

test("extracts phases, facts, footer, op-url", () => {
  const slides = extractDeckSlides(FYH_FIXTURE);
  assert.equal(slides.length, 3);

  const s4 = slides.find((s) => s.slideId === "s4");
  assert.ok(s4);
  assert.equal(s4.extractedContent.phases.length, 4);
  assert.equal(s4.extractedContent.phases[0].heading, "正式上線");
  assert.equal(s4.extractedContent.cards.length, 4);
  assert.equal(s4.extractedContent.slideFooter, "庫存不因驗收升等");
  assert.ok(s4.extractedContent.callouts.includes("庫存不因驗收升等"));

  const s5 = slides.find((s) => s.slideId === "s5");
  assert.ok(s5);
  assert.equal(s5.extractedContent.facts.length, 4);
  assert.equal(s5.extractedContent.facts[0].value, "8");
  assert.match(s5.extractedContent.opUrls[0], /\/shop/);
});
