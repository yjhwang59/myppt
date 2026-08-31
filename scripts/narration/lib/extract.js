import fs from "node:fs";
import * as cheerio from "cheerio";

function cleanText(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function extractListItems($, el) {
  const items = [];
  $(el)
    .find("li")
    .each((_, li) => {
      const t = cleanText($(li).text());
      if (t) items.push(t);
    });
  return items;
}

function extractCards($, slide) {
  const cards = [];
  $(slide)
    .find(".card")
    .each((_, card) => {
      const $card = $(card);
      const heading =
        cleanText($card.find("strong").first().text()) ||
        cleanText($card.find(".num").first().text()) ||
        "";
      const paragraph = cleanText($card.find("p").first().text());
      const bullets = extractListItems($, card);
      if (heading || paragraph || bullets.length) {
        cards.push({ heading, paragraph, bullets });
      }
    });
  return cards;
}

function extractTable($, slide) {
  const rows = [];
  $(slide)
    .find("table.table tr")
    .each((_, tr) => {
      const cells = [];
      $(tr)
        .find("th, td")
        .each((__, cell) => {
          cells.push(cleanText($(cell).text()));
        });
      if (cells.length) rows.push(cells);
    });
  return rows.length ? rows : null;
}

function extractSvgLabels($, slide) {
  const labels = [];
  $(slide)
    .find("svg text")
    .each((_, node) => {
      const t = cleanText($(node).text());
      if (t && !/^[▼▲←→]$/.test(t)) labels.push(t);
    });
  return [...new Set(labels)];
}

function extractFlowSteps($, slide) {
  const steps = [];
  $(slide)
    .find(".flow-step")
    .each((_, step) => {
      const $step = $(step);
      steps.push({
        title: cleanText($step.find("strong").first().text()),
        description: cleanText($step.find(".flow-desc").first().text()),
      });
    });
  return steps;
}

function extractCallouts($, slide) {
  const callouts = [];
  $(slide)
    .find(".callout")
    .each((_, el) => {
      const t = cleanText($(el).text());
      if (t) callouts.push(t);
    });
  return callouts;
}

export function extractSlideContent($, slideEl) {
  const $slide = $(slideEl);
  const eyebrow = cleanText($slide.find(".eyebrow").first().text());
  const kicker = cleanText($slide.find(".kicker").first().text());
  const h1 = cleanText($slide.find("h1").first().text());
  const h2 = cleanText($slide.find("h2").first().text());
  const lead = cleanText($slide.find(".lead").first().text());
  const stamp = cleanText($slide.find(".stamp").first().text());

  return {
    eyebrow,
    kicker,
    headings: [h1, h2].filter(Boolean),
    lead,
    stamp,
    cards: extractCards($, slideEl),
    table: extractTable($, slideEl),
    flowSteps: extractFlowSteps($, slideEl),
    svgLabels: extractSvgLabels($, slideEl),
    callouts: extractCallouts($, slideEl),
  };
}

export function extractDeckSlides(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const slides = [];

  $(".slide").each((idx, el) => {
    const $el = $(el);
    const slideId = $el.attr("id") || `s${idx + 1}`;
    const title = $el.attr("data-title") || slideId;
    const extractedContent = extractSlideContent($, el);

    slides.push({
      slideId,
      index: idx + 1,
      title,
      extractedContent,
    });
  });

  return slides;
}

export function extractDeckFromFile(deckPath) {
  const html = fs.readFileSync(deckPath, "utf8");
  return extractDeckSlides(html);
}

export function summarizeSlide(slide) {
  const c = slide.extractedContent;
  const parts = [];
  if (c.headings?.length) parts.push(c.headings.join(" — "));
  if (c.lead) parts.push(c.lead);
  if (c.callouts?.[0]) parts.push(c.callouts[0]);
  return parts.join(" ").slice(0, 120);
}

export function estimateSecondsFromScript(script) {
  if (!script) return null;
  const chars = script.replace(/\s/g, "").length;
  // ~4.5 chars/sec for Mandarin presentation pace
  return Math.max(30, Math.min(120, Math.round(chars / 4.5)));
}
