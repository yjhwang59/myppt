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
