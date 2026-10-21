import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { migrateSlideFromHtml, renderLinks, renderSlideHtml } from "./slide-model.js";

test("renderLinks opens in a new tab and escapes text", () => {
  const html = renderLinks([{ label: "專有名詞 <b>", href: "https://aidc.work/blog/x" }]);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /專有名詞 &lt;b&gt;/);
});

test("renderLinks drops unsafe or empty links", () => {
  assert.equal(renderLinks([{ label: "x", href: "javascript:alert(1)" }]), "");
  assert.equal(renderLinks(undefined), "");
});

test("links round-trip through render and migrate", () => {
  const slide = { slideId: "s1", index: 1, title: "t", layout: "cards", h2: "h", cards: [], callouts: [],
    links: [{ label: "專有名詞", href: "https://aidc.work/blog/new-member-article-deck" }] };
  const $ = cheerio.load(renderSlideHtml(slide, 1), { decodeEntities: false });
  const back = migrateSlideFromHtml($, $(".slide").get(0), 0, 1);
  assert.deepEqual(back.links, slide.links);
});

test("arch-svg aria-label is configurable and defaults to the legacy label", () => {
  const base = { slideId: "s1", index: 1, title: "t", layout: "arch-svg", h2: "h", archSvgHtml: "<svg></svg>", cards: [], callouts: [] };
  assert.match(renderSlideHtml(base, 1), /aria-label="企業 AI 五層架構圖"/);
  const html = renderSlideHtml({ ...base, archSvgLabel: "頁面導覽圖" }, 1);
  assert.match(html, /aria-label="頁面導覽圖"/);
  const $ = cheerio.load(html, { decodeEntities: false });
  assert.equal(migrateSlideFromHtml($, $(".slide").get(0), 0, 1).archSvgLabel, "頁面導覽圖");
});

test("hero slides render and round-trip links too", () => {
  const slide = { slideId: "s1", index: 1, title: "t", layout: "hero", hero: true, kicker: "k", h1: "封面", lead: "l", stamp: "s", cards: [], callouts: [],
    links: [{ label: "Cursor 教學文件", href: "/examples/ai-agent-course-cursor-prompt-guide.html" }] };
  const html = renderSlideHtml(slide, 1);
  assert.match(html, /class="slide-links"/);
  const $ = cheerio.load(html, { decodeEntities: false });
  assert.deepEqual(migrateSlideFromHtml($, $(".slide").get(0), 0, 1).links, slide.links);
});

test("promptBlock renders escaped and round-trips with line breaks", () => {
  const slide = { slideId: "s1", index: 1, title: "t", layout: "cards", h2: "h", cards: [], callouts: [],
    promptBlock: { label: "教練提示詞", text: "第一行 <x>\n第二行" } };
  const html = renderSlideHtml(slide, 1);
  assert.match(html, /<pre>第一行 &lt;x&gt;\n第二行<\/pre>/);
  const $ = cheerio.load(html, { decodeEntities: false });
  const back = migrateSlideFromHtml($, $(".slide").get(0), 0, 1);
  assert.equal(back.layout, "cards");
  assert.deepEqual(back.promptBlock, slide.promptBlock);
});
