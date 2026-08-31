import fs from "node:fs";
import { SLIDE_STATUSES } from "./paths.js";

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function validateSlide(slide, index, errors) {
  const prefix = `slides[${index}]`;

  if (!slide.slideId || !/^s\d+$/.test(slide.slideId)) {
    errors.push(`${prefix}.slideId 必須符合 sN 格式`);
  }
  if (typeof slide.index !== "number" || slide.index < 1) {
    errors.push(`${prefix}.index 必須為正整數`);
  }
  if (!slide.title) errors.push(`${prefix}.title 不可為空`);
  if (!slide.sourceHash || !/^[a-f0-9]{64}$/.test(slide.sourceHash)) {
    errors.push(`${prefix}.sourceHash 必須為 SHA-256 hex`);
  }
  if (!isObject(slide.extractedContent)) {
    errors.push(`${prefix}.extractedContent 必須為物件`);
  }
  if (!SLIDE_STATUSES.includes(slide.status)) {
    errors.push(`${prefix}.status 無效: ${slide.status}`);
  }

  if (slide.script != null && typeof slide.script !== "string") {
    errors.push(`${prefix}.script 必須為字串或 null`);
  }

  if (["approved", "audio_ready", "audio_failed"].includes(slide.status) && !slide.script) {
    errors.push(`${prefix}: status=${slide.status} 但缺少 script`);
  }

  if (slide.status === "approved" && !slide.approvedAt) {
    errors.push(`${prefix}: approved 狀態建議設定 approvedAt`);
  }

  if (slide.cuePoints && !Array.isArray(slide.cuePoints)) {
    errors.push(`${prefix}.cuePoints 必須為陣列`);
  }
}

export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object") {
    return { ok: false, errors: ["manifest 不是有效物件"] };
  }

  if (manifest.version !== "1.0.0") errors.push("version 必須為 1.0.0");
  if (!manifest.deckId) errors.push("deckId 不可為空");
  if (!manifest.deckPath) errors.push("deckPath 不可為空");
  if (!manifest.promptVersion) errors.push("promptVersion 不可為空");
  if (!Array.isArray(manifest.slides) || manifest.slides.length === 0) {
    errors.push("slides 必須為非空陣列");
  } else {
    manifest.slides.forEach((slide, i) => validateSlide(slide, i, errors));

    const ids = manifest.slides.map((s) => s.slideId);
    const unique = new Set(ids);
    if (unique.size !== ids.length) errors.push("slideId 不可重複");

    for (let i = 0; i < manifest.slides.length; i++) {
      if (manifest.slides[i].index !== i + 1) {
        errors.push(`slides[${i}].index 應為 ${i + 1}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function loadAndValidateManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const result = validateManifest(manifest);
  return { manifest, ...result };
}
