import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { detectSourceFlavor, extractSlideContent } from "./extract.js";

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
  if ($el.find(".phase-line").length) return "phases";
  if ($el.find("table.table").length && !$el.find(".grid .card").length) return "table";
  if ($el.find(".facts").length) return "facts";
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
    h2: layout === "hero" ? "" : content.headings[1] || content.headings[0] || "",
    lead: content.lead,
    stamp: content.stamp,
    cards: extractCardsDetailed($, el),
    flowSteps: content.flowSteps,
    table: content.table,
    callouts: content.callouts,
    phases: content.phases || [],
    facts: content.facts || [],
    slideFooter: content.slideFooter || "",
    opUrls: content.opUrls || [],
  };

  if (!slide.cards.length && slide.phases.length) {
    slide.cards = slide.phases.map((p) => ({
      num: null,
      tag: null,
      tagClass: p.tone || null,
      heading: p.heading,
      paragraph: p.paragraph,
      bullets: [],
    }));
  }
  const links = $el
    .find(".slide-links a")
    .toArray()
    .map((a) => ({ label: cleanText($(a).text()), href: $(a).attr("href") || "" }));
  if (links.length) slide.links = links;
  const $prompt = $el.find(".slide-prompt").first();
  if ($prompt.length) {
    slide.promptBlock = { label: cleanText($prompt.find("figcaption").first().text()), text: $prompt.find("pre").first().text() };
  }

  if (layout === "arch-svg") {
    slide.archSvgHtml = $el.find(".arch-svg-wrap").html()?.trim() || "";
    const label = $el.find(".arch-svg-wrap").attr("aria-label");
    if (label && label !== "企業 AI 五層架構圖") slide.archSvgLabel = label;
  }

  slide.footerBrand =
    cleanText($el.find(".footer span").first().text()) || content.slideFooter || "企業 AI 整合平台";
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

function safeHref(href) {
  const value = String(href || "").trim();
  return /^(https?:\/\/|\/|#)/i.test(value) ? value : "";
}

/** Optional slide.links: [{ label, href }] → one row of external links (new tab). */
export function renderLinks(links) {
  const items = (links || [])
    .map((l) => ({ label: l?.label, href: safeHref(l?.href) }))
    .filter((l) => l.label && l.href);
  if (!items.length) return "";
  return `<p class="slide-links">${items
    .map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`)
    .join("")}</p>`;
}

/** Optional slide.promptBlock: { label, text } → one copyable prompt block (line breaks kept). */
export function renderPromptBlock(block) {
  if (!block?.text) return "";
  const label = block.label ? `<figcaption>${escapeHtml(block.label)}</figcaption>` : "";
  return `<figure class="slide-prompt">${label}<pre>${escapeHtml(block.text)}</pre></figure>`;
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
    body += renderLinks(slide.links);
  } else {
    body += slide.eyebrow ? `<p class="eyebrow">${escapeHtml(slide.eyebrow)}</p>` : "";
    body += slide.h2 ? `<h2>${escapeHtml(slide.h2)}</h2>` : "";
    body += slide.lead ? `<p class="lead">${escapeHtml(slide.lead)}</p>` : "";
    body += renderPromptBlock(slide.promptBlock);

    if (slide.layout === "arch-svg") {
      body += `<div class="arch-svg-wrap" role="img" aria-label="${escapeHtml(slide.archSvgLabel || "企業 AI 五層架構圖")}">${slide.archSvgHtml || ""}</div>`;
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
    body += renderLinks(slide.links);
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
    sourceType: "html",
    sourceFlavor: detectSourceFlavor(html),
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

function projectSlideForRoundTrip(slide) {
  const layout = slide.layout;
  return {
    slideId: slide.slideId,
    index: slide.index,
    title: slide.title,
    layout,
    hero: Boolean(slide.hero) || layout === "hero",
    eyebrow: slide.eyebrow || "",
    kicker: slide.kicker || "",
    h1: slide.h1 || "",
    h2: slide.h2 || "",
    lead: slide.lead || "",
    stamp: slide.stamp || "",
    cards: (slide.cards || []).map((card) => ({
      num: card.num || null,
      tag: card.tag || null,
      tagClass: card.tagClass || null,
      heading: card.heading || "",
      paragraph: card.paragraph || "",
      bullets: [...(card.bullets || [])],
    })),
    flowSteps: (slide.flowSteps || []).map((step) => ({
      title: step.title || "",
      description: step.description || "",
    })),
    table: slide.table?.length ? slide.table : null,
    callouts: [...(slide.callouts || [])],
    links: (slide.links || []).map((link) => ({ label: link.label, href: link.href })),
    footerBrand: slide.footerBrand || "企業 AI 整合平台",
    footerPage: slide.footerPage || "",
    archSvgHtml: layout === "arch-svg" ? slide.archSvgHtml || "" : "",
    archSvgLabel: layout === "arch-svg" ? slide.archSvgLabel || "企業 AI 五層架構圖" : "",
  };
}

/** Render slides to HTML and migrate them back. Returns field mismatches. */
export function roundTripMismatches(deckData) {
  const html = `<main id="deck">\n${buildDeckMainHtml(deckData)}\n  </main>`;
  const $ = cheerio.load(html, { decodeEntities: false });
  const els = $(".slide").toArray();
  const back = els.map((el, i) => migrateSlideFromHtml($, el, i, els.length));
  const mismatches = [];
  for (let i = 0; i < deckData.slides.length; i++) {
    const expected = projectSlideForRoundTrip(deckData.slides[i]);
    const actual = projectSlideForRoundTrip(back[i] || {});
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatches.push({ slideId: deckData.slides[i].slideId || `s${i + 1}`, expected, actual });
    }
  }
  if (back.length !== deckData.slides.length) {
    mismatches.push({
      slideId: "*",
      expected: { count: deckData.slides.length },
      actual: { count: back.length },
    });
  }
  return mismatches;
}
