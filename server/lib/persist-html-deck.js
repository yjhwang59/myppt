import fs from "node:fs";
import path from "node:path";
import { extractDeckFromFile } from "../../scripts/narration/lib/extract.js";
import { mergeExtractedSlides, readManifest, recalcManifestMeta, writeManifest } from "../../scripts/narration/lib/manifest.js";
import {
  UPLOADS_DIR,
  deckHtmlPath,
  manifestPath,
  slidesJsonPath,
} from "../../scripts/narration/lib/paths.js";
import { migrateDeckHtml, writeSlidesJson } from "../../scripts/narration/lib/slide-model.js";
import { getDeckSummary, upsertRegistryEntry } from "./registry.js";
import { prepareImportedHtml } from "./html-import.js";
import { ensureNarrationSupport } from "./narration-inject.js";

export async function persistHtmlDeck({ html, deckId, title, sourceUrl = "", catalog = {} }) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const prepared = await prepareImportedHtml({ html, deckId, sourceUrl });
  const withNarration = ensureNarrationSupport(prepared.html, deckId);
  const tmpCheck = path.join(UPLOADS_DIR, `${deckId}-check.html`);
  fs.writeFileSync(tmpCheck, withNarration, "utf8");
  const extracted = extractDeckFromFile(tmpCheck);
  fs.unlinkSync(tmpCheck);
  if (!extracted.length) throw new Error("HTML 中找不到 .slide 投影片");

  fs.writeFileSync(deckHtmlPath(deckId), withNarration, "utf8");
  const deckData = migrateDeckHtml(withNarration, deckId);
  deckData.title = title;
  deckData.sourceType = "html";
  deckData.sourceFlavor = prepared.sourceFlavor;
  writeSlidesJson(slidesJsonPath(deckId), deckData);

  const existing = readManifest(manifestPath(deckId));
  const manifest = mergeExtractedSlides({
    deckId,
    deckPath: `${deckId}.html`,
    extractedSlides: extracted,
    existingManifest: existing,
    title,
    sourceType: "html",
    sourceFlavor: prepared.sourceFlavor,
  });
  recalcManifestMeta(manifest);
  writeManifest(manifest, manifestPath(deckId));
  upsertRegistryEntry({ deckId, title, sourceType: "html", ...catalog });
  return getDeckSummary(deckId);
}
