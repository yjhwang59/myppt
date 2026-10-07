import fs from "node:fs";
import { REGISTRY_PATH } from "./paths.js";

export function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

export function getRegistryEntry(deckId) {
  const registry = readRegistry();
  return (registry.decks || []).find((deck) => deck.deckId === deckId) || null;
}

/**
 * Admin / build:deck policy.
 * pipeline=native 可進後台與旁白管線。
 * htmlRebuild=safe 允許覆寫 HTML；gated 僅在 round-trip 等價時寫入；off 拒絕。
 */
export function getDeckPolicy(deckId) {
  const entry = getRegistryEntry(deckId);
  const sourceType = entry?.sourceType || "html";
  const format = entry?.format || (sourceType === "pdf" ? "pdf" : "html-hand");
  const pipeline = entry?.pipeline || "none";
  const htmlRebuild = entry?.htmlRebuild || "off";
  return {
    deckId,
    title: entry?.title || deckId,
    sourceType,
    format,
    pipeline,
    htmlRebuild,
    note: entry?.note || "",
    admin: pipeline === "native",
    known: Boolean(entry),
  };
}

export function listAdminDecks() {
  const registry = readRegistry();
  return (registry.decks || [])
    .filter((deck) => deck.pipeline === "native")
    .map((deck) => getDeckPolicy(deck.deckId));
}
