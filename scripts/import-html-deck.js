#!/usr/bin/env node
/**
 * Import a standalone HTML deck into the local AI-PPT library.
 * Does not wrangler-deploy or synthesize TTS.
 *
 *   node scripts/import-html-deck.js --file <path> --deck-id <id> --title <title> [--overwrite]
 */
import fs from "node:fs";
import path from "node:path";
import { persistHtmlDeck } from "../server/lib/persist-html-deck.js";
import { deckHtmlPath, isValidDeckId } from "./narration/lib/paths.js";

const PROTECTED_IDS = new Set(["enterprise-ai-portal-deck"]);
const DISCOURAGED_IDS = new Set(["deck"]);

function parseArgs(argv) {
  const out = { overwrite: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--overwrite") out.overwrite = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if ((a === "--file" || a === "--deck-id" || a === "--title") && next == null) {
      throw new Error(`${a} 需要參數`);
    } else if (a === "--file") {
      out.file = next;
      i++;
    } else if (a === "--deck-id") {
      out.deckId = String(next).toLowerCase();
      i++;
    } else if (a === "--title") {
      out.title = next;
      i++;
    } else {
      throw new Error(`未知參數：${a}`);
    }
  }
  return out;
}

function usage() {
  return `用法：
  node scripts/import-html-deck.js --file <html> --deck-id <id> --title <title> [--overwrite]

deckId 僅 a-z0-9-（例：fyhgoogle-2026-w37）。禁止 enterprise-ai-portal-deck。`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    console.error(e.message);
    console.error(usage());
    process.exit(1);
  }

  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!args.file || !args.deckId) {
    console.error("需要 --file 與 --deck-id");
    console.error(usage());
    process.exit(1);
  }

  if (!isValidDeckId(args.deckId)) {
    console.error(`deckId 格式無效：${args.deckId}（僅 a-z0-9-，長度 ≤80）`);
    process.exit(1);
  }
  if (PROTECTED_IDS.has(args.deckId)) {
    console.error(`拒絕覆寫保護中的 deckId：${args.deckId}`);
    process.exit(1);
  }
  if (DISCOURAGED_IDS.has(args.deckId)) {
    console.error("禁止使用泛用 deckId「deck」（簡報庫已佔）。請用 {slug}-yyyy-wxx。");
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`找不到檔案：${filePath}`);
    process.exit(1);
  }

  const dest = deckHtmlPath(args.deckId);
  if (fs.existsSync(dest) && !args.overwrite) {
    console.error(`deckId「${args.deckId}」已存在：${dest}`);
    console.error("若要覆寫請加 --overwrite");
    process.exit(2);
  }

  const html = fs.readFileSync(filePath, "utf8");
  const title = String(args.title || "").trim() || args.deckId;
  const deck = await persistHtmlDeck({ html, deckId: args.deckId, title });
  console.log(
    JSON.stringify(
      {
        ok: true,
        deckId: deck.deckId,
        title: deck.title,
        slideCount: deck.slideCount,
        html: dest,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
