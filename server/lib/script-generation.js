import fs from "node:fs";
import path from "node:path";
import { pageImageAbsoluteFromUrl } from "../../scripts/narration/lib/paths.js";
import { generateScriptWithLlm } from "../../scripts/narration/lib/llm.js";
import { readSourceTranscript } from "./transcript.js";
import { resolveLlmModel } from "./llm-models.js";

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

export function loadSlidePageImageDataUrl(slide, sourceType) {
  if (sourceType !== "pdf") return null;
  const url = slide.extractedContent?.pageImageUrl;
  const abs = pageImageAbsoluteFromUrl(url);
  if (!abs) return null;
  const buf = fs.readFileSync(abs);
  const mime = mimeFromPath(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function buildGenerationOptions(manifest, reqBody = {}) {
  const model = resolveLlmModel(reqBody?.model, manifest.modelVersion);
  const transcript = readSourceTranscript(manifest.deckId);
  const sourceType = manifest.sourceType || "html";
  const batchMode = Boolean(reqBody?.batchMode);
  const visionDetail =
    reqBody?.visionDetail ||
    (batchMode && !reqBody?.batchVisionHigh ? "low" : "high");

  return {
    model,
    sourceTranscript: transcript.text || "",
    sourceType,
    visionDetail,
    includeVision: sourceType === "pdf",
  };
}

export async function generateSlideScript(manifest, slideIndex, reqBody = {}) {
  const slide = manifest.slides[slideIndex];
  const { buildGenerationContext } = await import("../../scripts/narration/lib/manifest.js");
  const context = buildGenerationContext(manifest, slideIndex);
  const opts = buildGenerationOptions(manifest, reqBody);

  const pageImageDataUrl = opts.includeVision ? loadSlidePageImageDataUrl(slide, opts.sourceType) : null;

  const result = await generateScriptWithLlm(slide, context, {
    model: opts.model,
    sourceTranscript: opts.sourceTranscript,
    pageImageDataUrl,
    visionDetail: opts.visionDetail,
    sourceType: opts.sourceType,
  });

  if (result.modelVersion && !result.modelVersion.startsWith("template")) {
    manifest.modelVersion = result.modelVersion;
  }

  return result;
}
