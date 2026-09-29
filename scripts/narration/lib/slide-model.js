import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { extractSlideContent } from "./extract.js";

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function detectLayout($, el) {
  const $el = $(el);
  if ($el.hasClass("hero")) return "hero";
  if ($el.find(".arch-svg-wrap").length) return "arch-svg";
  if ($el.find("table.table").length && !$el.find(".grid .card").length) return "table";
  if ($el.find(".flow-step").length >= 3 && $el.find(".grid .card").length === 0) return "flow";
  if ($el.find(".grid.six").length) return "cards-six";
  if ($el.find(".grid.three").length) return "cards-three";
  if ($el.find(".grid.two").length) return "cards-two";
  return "cards";
}

function extractCardsDetailed($, slide) {
  const cards = [];
  $(slide)
    .find(".card")
    .each((_, card) => {
      const $card = $(card);
      const num = cleanText($card.find(".num").first().text());
      const tagEl = $card.find(".tag").first();
      cards.push({
        num: num || null,
        tag: cleanText(tagEl.text()) || null,
        tagClass: tagEl.attr("class")?.split(" ").find((c) => c !== "tag") || null,
        heading: cleanText($card.find("strong").first().text()),
        paragraph: cleanText($card.find("> p").first().text()),
        bullets: [],
      });
      $card.find("li").each((__, li) => {
        cards[cards.length - 1].bullets.push(cleanText($(li).html()).replace(/<\/?strong>/g, ""));
      });
    });
  return cards;
}

export function migrateSlideFromHtml($, el, index, total) {
  const $el = $(el);
  const slideId = $el.attr("id") || `s${index + 1}`;
  const title = $el.attr("data-title") || slideId;
  const layout = detectLayout($, el);
  const content = extractSlideContent($, el);

  const slide = {
    slideId,
    index: index + 1,
    title,
    layout,
    hero: layout === "hero",
    eyebrow: content.eyebrow,
    kicker: content.kicker,
    h1: ($el.find("h1").first().html() || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim(),
    h2: content.headings[1] || content.headings[0] || "",
    lead: content.lead,
    stamp: content.stamp,
    cards: extractCardsDetailed($, el),
    flowSteps: content.flowSteps,
    table: content.table,
    callouts: content.callouts,
  };

  if (layout === "arch-svg") {
    slide.archSvgHtml = $el.find(".arch-svg-wrap").html()?.trim() || "";
  }

  slide.footerBrand = cleanText($el.find(".footer span").first().text()) || "企業 AI 整合平台";
  slide.footerPage = `${index + 1} / ${total}`;
  return slide;
}

function renderCallout(text) {
  if (!text) return "";
  if (text.includes("：")) {
    const [label, ...rest] = text.split("：");
    return `<div class="callout"><strong>${escapeHtml(label)}：</strong>${escapeHtml(rest.join("："))}</div>`;
  }
  return `<div class="callout">${escapeHtml(text)}</div>`;
}

function renderCard(card, extraClass = "") {
  const cls = ["card", extraClass].filter(Boolean).join(" ");
  const num = card.num ? `<div class="num">${escapeHtml(card.num)}</div>` : "";
  const tag = card.tag
    ? `<span class="tag ${escapeHtml(card.tagClass || "")}">${escapeHtml(card.tag)}</span>`
    : "";
  const paragraph = card.paragraph ? `<p>${escapeHtml(card.paragraph)}</p>` : "";
  const bullets =
    card.bullets?.length
      ? `<ul>${card.bullets.map((b) => `<li>${b.includes("<") ? b : escapeHtml(b)}</li>`).join("")}</ul>`
      : "";
  return `<article class="${cls}">${num}${tag}<strong>${escapeHtml(card.heading)}</strong>${paragraph}${bullets}</article>`;
}

function gridClass(layout) {
  if (layout === "cards-six") return "six";
  if (layout === "cards-three") return "three";
  if (layout === "cards-two") return "two";
  return "three";
}

export function renderSlideHtml(slide, total) {
  const active = slide.index === 1 ? " active" : "";
  const heroClass = slide.hero || slide.layout === "hero" ? " hero" : "";
  const footerPage = `${slide.index} / ${total}`;
  let body = "";

  if (slide.layout === "hero") {
    body = `
      ${slide.kicker ? `<p class="kicker">${escapeHtml(slide.kicker)}</p>` : ""}
      <h1>${(slide.h1 || "").split("\n").map(escapeHtml).join("<br />")}</h1>
      ${slide.lead ? `<p class="lead">${escapeHtml(slide.lead)}</p>` : ""}
      ${slide.stamp ? `<p class="stamp">${escapeHtml(slide.stamp)}</p>` : ""}`;
  } else {
    body += slide.eyebrow ? `<p class="eyebrow">${escapeHtml(slide.eyebrow)}</p>` : "";
    body += slide.h2 ? `<h2>${escapeHtml(slide.h2)}</h2>` : "";
    body += slide.lead ? `<p class="lead">${escapeHtml(slide.lead)}</p>` : "";

    if (slide.layout === "arch-svg") {
      body += `<div class="arch-svg-wrap" role="img" aria-label="企業 AI 五層架構圖">${slide.archSvgHtml || ""}</div>`;
    } else if (slide.layout === "flow") {
      body += `<div class="flow" role="list">${slide.flowSteps
        .map(
          (step, i) => `
        ${i ? '<div class="flow-arrow" aria-hidden="true"></div>' : ""}
        <div class="flow-step" role="listitem">
          <div class="flow-num">${i + 1}</div>
          <strong>${escapeHtml(step.title)}</strong>
          <p class="flow-desc">${escapeHtml(step.description)}</p>
        </div>`
        )
        .join("")}</div>`;
    } else if (slide.layout === "table" && slide.table?.length) {
      const [head, ...rows] = slide.table;
      body += `<table class="table"><thead><tr>${head.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<td><strong>${escapeHtml(c)}</strong></td>` : `<td>${escapeHtml(c)}</td>`)).join("")}</tr>`)
        .join("")}</tbody></table>`;
    } else if (slide.cards?.length) {
      const extra = slide.layout === "cards-two" && slide.cards.some((c) => c.tag) ? " two" : "";
      body += `<div class="grid ${gridClass(slide.layout)}${extra}">${slide.cards
        .map((c) => {
          let cardClass = "";
          if (c.tagClass === "orange") cardClass = "model-card bedrock-card";
          if (c.tagClass === "green") cardClass = "model-card nim-card";
          return renderCard(c, cardClass);
        })
        .join("")}</div>`;
    }

    if (slide.callouts?.[0]) body += renderCallout(slide.callouts[0]);
    if (slide.sourceUrl) {
      const label = slide.sourceLabel || slide.sourceUrl;
      body += `<p class="mini-note">原文：<a href="${escapeHtml(slide.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></p>`;
    }
  }

  return `    <section class="slide${heroClass}${active}" id="${escapeHtml(slide.slideId)}" data-title="${escapeHtml(slide.title)}">
${body}
      <div class="footer"><span>${escapeHtml(slide.footerBrand || "企業 AI 整合平台")}</span><span>${footerPage}</span></div>
    </section>`;
}

export function readSlidesJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeSlidesJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function migrateDeckHtml(html, deckId) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const slideEls = $(".slide").toArray();
  const total = slideEls.length;
  const slides = slideEls.map((el, i) => migrateSlideFromHtml($, el, i, total));
  return {
    version: "1.0.0",
    deckId,
    title: "企業 AI 入口網｜整合平台架構",
    slides,
  };
}

export function buildDeckMainHtml(deckData) {
  const total = deckData.slides.length;
  return deckData.slides.map((s) => renderSlideHtml(s, total)).join("\n\n");
}

export function patchDeckHtml(html, deckData) {
  const mainInner = buildDeckMainHtml(deckData);
  return html.replace(/<main id="deck">[\s\S]*?<\/main>/, `<main id="deck">\n${mainInner}\n  </main>`);
}
