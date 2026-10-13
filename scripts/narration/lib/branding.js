import fs from "node:fs";
import path from "node:path";
import { PRESENTATIONS_DIR } from "./paths.js";

const BRANDING_PATH = path.join(PRESENTATIONS_DIR, "branding.json");

let cached;

export function loadBranding() {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(BRANDING_PATH, "utf8"));
  }
  return cached;
}

export function brandRole() {
  return loadBranding().role;
}

/**
 * Footer / stamp role line. Keeps a leading person name already shown.
 * Slide-specific notes that are not in the shared brand list stay as written.
 */
export function normalizeBrand(value) {
  const branding = loadBranding();
  const role = branding.role;
  let text = String(value || "").trim();
  if (!text) return role;
  if (branding.legacyTitle && text.includes(branding.legacyTitle)) {
    text = text.replaceAll(branding.legacyTitle, role);
  }
  if (branding.collapseExact?.includes(text)) {
    const name = (branding.names || []).find((candidate) => text.startsWith(candidate));
    return name ? `${name}｜${role}` : role;
  }
  if ((branding.names || []).includes(text)) {
    return `${text}｜${role}`;
  }
  return text;
}
