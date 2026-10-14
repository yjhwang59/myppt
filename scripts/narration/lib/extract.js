import fs from "node:fs";
import * as cheerio from "cheerio";

export function detectSourceFlavor(html) {
  const text = String(html || "");
  if (/deck-chrome\.(css|js)/i.test(text) || /hero-copy/.test(text) || /phase-line/.test(text)) {
    return "fyh-deck-chrome";
  }
  return "ai-eip-native";
}

export function shouldSkipHtmlPatch(deckData, html = "") {
  if (deckData?.sourceType === "pdf") return true;
  if (deckData?.sourceFlavor === "fyh-deck-chrome") return true;
  return detectSourceFlavor(html) === "fyh-deck-chrome";
}

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

function phaseTone($el) {
  const cls = String($el.attr("class") || "");
  if (/\bg\b/.test(cls)) return "g";
  if (/\by\b/.test(cls)) return "y";
  if (/\bb\b/.test(cls)) return "b";
  if (/\br\b/.test(cls)) return "r";
  return null;
}

export function extractPhases($, slide) {
  const phases = [];
  $(slide)
    .find(".phase")
    .each((_, el) => {
      const $el = $(el);
      const heading = cleanText($el.find("strong").first().text());
      const paragraph = cleanText($el.find("p").first().text());
      if (heading || paragraph) {
        phases.push({ heading, paragraph, tone: phaseTone($el) });
      }
    });
  return phases;
}

export function extractFacts($, slide) {
  const facts = [];
  $(slide)
    .find(".fact")
    .each((_, el) => {
      const $el = $(el);
      const value = cleanText($el.find("b").first().text());
      const label = cleanText($el.find("span").first().text());
      if (value || label) facts.push({ value, label });
    });
  return facts;
}

export function extractSlideFooter($, slide) {
  return cleanText($(slide).children("footer").first().text());
}

export function extractOpUrls($, slide) {
  const urls = [];
  $(slide)
    .find(".op-url")
    .each((_, el) => {
      const t = cleanText($(el).text());
      if (t) urls.push(t);
    });
  return urls;
}

function cardsFromPhases(phases) {
  return phases.map((p) => ({
    heading: p.heading,
    paragraph: p.paragraph,
    bullets: [],
  }));
}

export function extractSlideContent($, slideEl) {
  const $slide = $(slideEl);
  const eyebrow = cleanText($slide.find(".eyebrow").first().text());
  const kicker = cleanText($slide.find(".kicker").first().text());
  const h1 = cleanText($slide.find("h1").first().text());
  const h2 = cleanText($slide.find("h2").first().text());
  const lead = cleanText($slide.find(".lead").first().text());
  const stamp = cleanText($slide.find(".stamp").first().text());
  const phases = extractPhases($, slideEl);
  const facts = extractFacts($, slideEl);
  const slideFooter = extractSlideFooter($, slideEl);
  const opUrls = extractOpUrls($, slideEl);
  let cards = extractCards($, slideEl);
  if (!cards.length && phases.length) cards = cardsFromPhases(phases);
  const callouts = extractCallouts($, slideEl);
  if (!callouts.length && slideFooter) callouts.push(slideFooter);

  return {
    eyebrow,
    kicker,
    headings: [h1, h2].filter(Boolean),
    lead,
    stamp,
    cards,
    table: extractTable($, slideEl),
    flowSteps: extractFlowSteps($, slideEl),
    svgLabels: extractSvgLabels($, slideEl),
    callouts,
    phases,
    facts,
    slideFooter,
    opUrls,
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
  if (c.phases?.length) parts.push(c.phases.map((p) => p.heading).filter(Boolean).join("／"));
  if (c.facts?.length) parts.push(c.facts.map((f) => `${f.value}${f.label || ""}`).join(" "));
  if (c.callouts?.[0]) parts.push(c.callouts[0]);
  return parts.join(" ").slice(0, 120);
}

export function estimateSecondsFromScript(script) {
  if (!script) return null;
  const chars = script.replace(/\s/g, "").length;
  // ~4.5 chars/sec for Mandarin presentation pace
  return Math.max(30, Math.min(120, Math.round(chars / 4.5)));
}
