import { patchDeckHtml } from "./slide-model.js";

function mainInner(html) {
  const match = String(html || "").match(/<main id="deck">([\s\S]*?)<\/main>/);
  return match ? match[1] : null;
}

export function normalizeMainHtml(html) {
  const inner = mainInner(html);
  if (inner == null) return null;
  return inner.replace(/\s+/g, " ").trim();
}

const STRUCTURAL_TOKENS = [
  "grid four",
  "grid two",
  "slogan-stack",
  "card risk",
  "flow-step gate",
  'class="pitch"',
  'class="instructor"',
  "arch-svg-wrap",
];

export function summarizeRebuildDrift(beforeHtml, afterHtml) {
  const before = normalizeMainHtml(beforeHtml) || "";
  const after = normalizeMainHtml(afterHtml) || "";
  const lost = STRUCTURAL_TOKENS.filter((token) => before.includes(token) && !after.includes(token));
  if (lost.length) {
    return `rebuild would drop markup that slides.json does not round-trip: ${lost.join(", ")}`;
  }
  if (before.length !== after.length) {
    return `rebuilt <main id="deck"> is not whitespace-equivalent (${before.length} → ${after.length} chars)`;
  }
  return 'rebuilt <main id="deck"> is not whitespace-equivalent to the current HTML';
}

export function assessHtmlRebuild(html, deckData) {
  if (!/<main id="deck">[\s\S]*?<\/main>/.test(html || "")) {
    return {
      ok: false,
      reason: "missing-main",
      summary: 'no <main id="deck">; refused to write',
      patched: null,
    };
  }
  const patched = patchDeckHtml(html, deckData);
  const equivalent = normalizeMainHtml(html) === normalizeMainHtml(patched);
  return {
    ok: equivalent,
    reason: equivalent ? "equivalent" : "main-drift",
    summary: equivalent ? "rebuilt main matches current HTML" : summarizeRebuildDrift(html, patched),
    patched,
  };
}

export function rebuildDecision(policy, assessment) {
  if (!policy || policy.htmlRebuild === "off") {
    return { write: false, reason: `htmlRebuild=off (${policy?.format || "html-hand"} stays SSOT)` };
  }
  if (policy.htmlRebuild === "gated") {
    return {
      write: Boolean(assessment?.ok),
      reason: assessment?.ok ? "round-trip equivalent" : assessment?.summary || "rebuild gated",
    };
  }
  if (policy.htmlRebuild === "safe") {
    return {
      write: true,
      reason: assessment?.ok ? "round-trip equivalent" : "htmlRebuild=safe",
    };
  }
  return { write: false, reason: `unknown htmlRebuild=${policy.htmlRebuild}` };
}
