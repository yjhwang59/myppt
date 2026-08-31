import crypto from "node:crypto";

/**
 * Stable JSON stringify for hashing slide extracted content.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function hashContent(content) {
  const normalized = stableStringify(content);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}
