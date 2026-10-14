import * as cheerio from "cheerio";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function headingHtml(value) {
  return String(value || "")
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>");
}

function setTextIfChanged(section, selector, previous, next) {
  if (next == null || next === previous) return;
  const node = section.find(selector).first();
  if (node.length) node.text(next);
}

function setHeadingIfChanged(section, selector, previous, next) {
  if (next == null || next === previous) return;
  const node = section.find(selector).first();
  if (node.length) node.html(headingHtml(next));
}

function patchCards($, section, previousCards, nextCards) {
  if (!Array.isArray(nextCards) || !nextCards.length) return;
  const prev = Array.isArray(previousCards) ? previousCards : [];
  section.find(".card").each((i, el) => {
    const next = nextCards[i];
    if (!next) return;
    const before = prev[i] || {};
    const node = $(el);
    if (next.num && next.num !== before.num) node.find(".num").first().text(next.num);
    if (next.heading && next.heading !== before.heading) {
      const heading = node.find("h3, strong").first();
      if (heading.length) heading.text(next.heading);
    }
    const bullets = Array.isArray(next.bullets) ? next.bullets : null;
    const prevBullets = Array.isArray(before.bullets) ? before.bullets : [];
    if (!bullets) return;
    node.find("li").each((j, li) => {
      const bullet = bullets[j];
      if (bullet == null || bullet === prevBullets[j]) return;
      if (String(bullet).includes("<")) $(li).html(bullet);
      else $(li).text(bullet);
    });
  });
}

/**
 * Update one slide section in place. Unrelated markup (matrix tables, links, flow steps) stays.
 */
export function patchSlideHtml(html, { index = 1, slideId, previous = {}, next = {} } = {}) {
  const $ = cheerio.load(String(html || ""), { decodeEntities: false });
  const section = $(".slide").eq(Math.max(0, Number(index) - 1));
  if (!section.length) return html;

  if (slideId) section.attr("id", slideId);
  if (next.title != null && next.title !== previous.title) section.attr("data-title", next.title);
  setTextIfChanged(section, "p.kicker", previous.kicker, next.kicker);
  setHeadingIfChanged(section, "h1", previous.h1, next.h1);
  setTextIfChanged(section, "h2", previous.h2, next.h2);
  setTextIfChanged(section, "p.lead", previous.lead, next.lead);
  setTextIfChanged(section, ".stamp", previous.stamp, next.stamp);

  const prevCallout = previous.callouts?.[0] || "";
  const nextCallout = Array.isArray(next.callouts) ? next.callouts[0] || "" : null;
  if (nextCallout != null && nextCallout !== prevCallout) {
    const callout = section.find(".callout").first();
    if (callout.length) callout.text(nextCallout);
  }

  patchCards($, section, previous.cards, next.cards);
  return $.html();
}
