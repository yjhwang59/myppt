import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AUDIO_DIR,
  DECK_ID,
  audioAbsolutePath,
  audioRelativeUrl,
  deckHtmlPath,
  legacyAudioAbsolutePath,
  legacyAudioRelativeUrl,
  manifestPath,
  resolveDeckId,
} from "./paths.js";
import { getDeckPolicy, listAdminDecks } from "./registry.js";
import { assessHtmlRebuild, rebuildDecision } from "./rebuild-safety.js";
import { readSlidesJson } from "./slide-model.js";
import { slidesJsonPath } from "./paths.js";

const PCCU = "pccu-1151-bigdata-2026-10-03";

test("audio and narration paths are per deck", () => {
  assert.equal(audioRelativeUrl("s1", PCCU), `narration/audio/${PCCU}/s01.mp3`);
  assert.equal(audioRelativeUrl("s10", DECK_ID), `narration/audio/${DECK_ID}/s10.mp3`);
  assert.equal(audioAbsolutePath("s2", PCCU).endsWith(`audio/${PCCU}/s02.mp3`), true);
  assert.equal(manifestPath(PCCU).endsWith(`narration/${PCCU}.json`), true);
  assert.equal(deckHtmlPath(DECK_ID).endsWith(`${DECK_ID}.html`), true);
  assert.equal(legacyAudioRelativeUrl("s1"), "narration/audio/s01.mp3");
});

test("resolveDeckId keeps enterprise as the default", () => {
  assert.equal(resolveDeckId([]), DECK_ID);
  assert.equal(resolveDeckId(["--deck=pccu-1151-bigdata-2026-10-03", "--check"]), PCCU);
  assert.equal(resolveDeckId([PCCU, "--check"], { positional: true }), PCCU);
  assert.throws(() => resolveDeckId(["--deck=../secrets"]));
});

test("admin registry exposes enterprise and pccu only", () => {
  const admin = listAdminDecks().map((deck) => deck.deckId);
  assert.deepEqual(admin, [DECK_ID, PCCU]);
  assert.equal(getDeckPolicy(DECK_ID).htmlRebuild, "gated");
  assert.equal(getDeckPolicy(PCCU).pipeline, "native");
  assert.equal(getDeckPolicy(PCCU).htmlRebuild, "gated");
  assert.equal(getDeckPolicy("deck").htmlRebuild, "off");
  assert.equal(getDeckPolicy("deck").format, "html-hand");
  assert.equal(getDeckPolicy("taiwan-ai-strategic-blueprint").format, "pdf");
  assert.equal(getDeckPolicy("test-pdf-deck").pipeline, "none");
});

test("enterprise legacy audio symlinks follow the per-deck files", () => {
  for (let n = 1; n <= 11; n++) {
    const slideId = `s${n}`;
    const legacy = legacyAudioAbsolutePath(slideId);
    const canonical = audioAbsolutePath(slideId, DECK_ID);
    assert.equal(fs.lstatSync(legacy).isSymbolicLink(), true, legacy);
    assert.equal(fs.readlinkSync(legacy), `${DECK_ID}/s${String(n).padStart(2, "0")}.mp3`);
    assert.equal(fs.statSync(legacy).isFile(), true);
    assert.equal(fs.readFileSync(legacy).equals(fs.readFileSync(canonical)), true);
  }
  assert.equal(fs.existsSync(AUDIO_DIR), true);
});

test("native decks refuse a lossy HTML rebuild", () => {
  for (const deckId of [DECK_ID, PCCU]) {
    const htmlPath = deckHtmlPath(deckId);
    const before = fs.readFileSync(htmlPath);
    const assessment = assessHtmlRebuild(before.toString("utf8"), readSlidesJson(slidesJsonPath(deckId)));
    const decision = rebuildDecision(getDeckPolicy(deckId), assessment);
    assert.equal(assessment.ok, false, deckId);
    assert.equal(decision.write, false, deckId);
    assert.equal(fs.readFileSync(htmlPath).equals(before), true, deckId);
  }
});

test("pdf and fyh decks are not writable by build:deck policy", () => {
  for (const deckId of ["deck", "test-pdf-deck", "taiwan-ai-strategic-blueprint", "etl-big-data-methodology"]) {
    const decision = rebuildDecision(getDeckPolicy(deckId), { ok: true, summary: "equivalent" });
    assert.equal(decision.write, false, deckId);
  }
});
