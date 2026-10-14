import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import * as cheerio from "cheerio";
import { detectSourceFlavor } from "../../scripts/narration/lib/extract.js";
import { deckAssetsDir } from "../../scripts/narration/lib/paths.js";

export { detectSourceFlavor };

export const FYH_DEFAULT_ORIGIN = "https://fyh.aidc.work";
export const HTML_MAX_BYTES = 4 * 1024 * 1024;
export const ASSET_MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20_000;
export const FETCH_UA = "AI-PPT-html-import/1.0";

const FYH_ASSET_PREFIXES = ["/docs/assets/deck/", "/大成Logo", "/%E5%A4%A7%E6%88%90Logo"];

export function titleFromHtml(html, fallback = "") {
  const m = String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  return (m?.[1] || "").replace(/\s+/g, " ").trim() || fallback;
}

export function isPrivateIp(ip) {
  const value = String(ip || "").toLowerCase();
  if (!value) return true;
  if (value === "127.0.0.1" || value === "::1" || value === "0.0.0.0") return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  if (value.startsWith("169.254.")) return true;
  if (value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.")) {
    return true;
  }
  const m = value.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) return true;
  return false;
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw new Error("網址格式無效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("僅支援 http(s) 網址");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") {
    throw new Error("不允許本機或私網網址");
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new Error("不允許本機或私網網址");
  }
  const { address } = await dns.lookup(host);
  if (isPrivateIp(address)) throw new Error("不允許本機或私網網址");
  return url;
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function safeAssetName(pathname, used = new Set()) {
  const decoded = decodePathname(pathname.split("?")[0] || "");
  if (/大成Logo/i.test(decoded)) return uniqueName("dachan-logo.png", used);
  const base = path.posix.basename(decoded) || "asset";
  let name = base
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!name || name === ".") name = "asset";
  return uniqueName(name, used);
}

function uniqueName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length) || "asset";
  let i = 2;
  let next = `${stem}-${i}${ext}`;
  while (used.has(next)) {
    i += 1;
    next = `${stem}-${i}${ext}`;
  }
  used.add(next);
  return next;
}

function isFyhBundledPath(pathname) {
  const decoded = decodePathname(pathname);
  return FYH_ASSET_PREFIXES.some((prefix) => decoded.startsWith(prefix) || pathname.startsWith(prefix));
}

function isInternalSitePath(pathname) {
  return pathname.startsWith("/") && !pathname.startsWith("//");
}

async function fetchWithLimit(url, { maxBytes, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": FETCH_UA, Accept: "*/*" },
    });
    if (!res.ok) throw new Error(`抓取失敗 ${res.status}：${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`檔案過大（>${Math.round(maxBytes / 1024 / 1024)}MB）：${url}`);
    return { buf, finalUrl: res.url || url, contentType: res.headers.get("content-type") || "" };
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`抓取逾時：${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRemoteHtml(sourceUrl) {
  const url = await assertPublicUrl(sourceUrl);
  const { buf, finalUrl } = await fetchWithLimit(url.href, { maxBytes: HTML_MAX_BYTES });
  return { html: buf.toString("utf8"), sourceUrl: finalUrl };
}

function collectAssetRefs($) {
  const refs = [];
  $("link[rel='stylesheet'][href], link[rel=stylesheet][href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) refs.push({ el, attr: "href", value: href });
  });
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) refs.push({ el, attr: "src", value: src });
  });
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) refs.push({ el, attr: "src", value: src });
  });
  return refs;
}

function rewriteJsLogoPaths(js, logoPublicPath) {
  return String(js)
    .replaceAll("/大成Logo-transparent.png", logoPublicPath)
    .replaceAll("/%E5%A4%A7%E6%88%90Logo-transparent.png", logoPublicPath);
}

export function rewriteInternalAnchors(html, origin) {
  if (!origin) return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "");
    if (!isInternalSitePath(href)) return;
    if (href.startsWith("/docs/assets/")) return;
    try {
      $(el).attr("href", new URL(href, origin).href);
    } catch {
      /* keep */
    }
  });
  return $.html();
}

function resolveAssetUrl(raw, { sourceUrl, sourceOrigin, onlyFyhBundled }) {
  const href = String(raw || "").trim();
  if (!href || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("#")) return null;
  if (href.startsWith("//")) return onlyFyhBundled ? null : new URL(`https:${href}`);
  if (/^https?:\/\//i.test(href)) return onlyFyhBundled ? null : new URL(href);
  if (href.startsWith("/")) {
    if (onlyFyhBundled && !isFyhBundledPath(href)) return null;
    const origin = sourceOrigin || (isFyhBundledPath(href) ? FYH_DEFAULT_ORIGIN : null);
    if (!origin) return null;
    return new URL(href, origin);
  }
  if (sourceUrl && !onlyFyhBundled) return new URL(href, sourceUrl);
  return null;
}

async function downloadAsset(absUrl, destPath) {
  await assertPublicUrl(absUrl.href);
  const { buf } = await fetchWithLimit(absUrl.href, { maxBytes: ASSET_MAX_BYTES });
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return buf;
}

/**
 * Download chrome CSS/JS/logo and rewrite HTML to local /{deckId}/assets/ paths.
 */
export async function localizeHtmlAssets(html, { deckId, sourceUrl = "" } = {}) {
  const onlyFyhBundled = !sourceUrl;
  let sourceOrigin = FYH_DEFAULT_ORIGIN;
  if (sourceUrl) {
    const parsed = await assertPublicUrl(sourceUrl);
    sourceOrigin = parsed.origin;
    sourceUrl = parsed.href;
  }

  const flavor = detectSourceFlavor(html);
  const $ = cheerio.load(html, { decodeEntities: false });
  const used = new Set();
  const cache = new Map();
  const assetsDir = deckAssetsDir(deckId);
  fs.mkdirSync(assetsDir, { recursive: true });

  const logoAbs = new URL("/大成Logo-transparent.png", sourceOrigin);
  const logoName = safeAssetName(logoAbs.pathname, used);
  const logoPath = path.join(assetsDir, logoName);
  const logoPublic = `/${deckId}/assets/${logoName}`;
  const wantsLogo = flavor === "fyh-deck-chrome" || /大成Logo/.test(html);
  if (wantsLogo) {
    try {
      await downloadAsset(logoAbs, logoPath);
      cache.set(logoAbs.href, logoPublic);
    } catch (err) {
      console.warn(`[html-import] logo skipped: ${err.message}`);
    }
  }

  const refs = collectAssetRefs($);
  for (const ref of refs) {
    const abs = resolveAssetUrl(ref.value, { sourceUrl, sourceOrigin, onlyFyhBundled });
    if (!abs) continue;
    if (cache.has(abs.href)) {
      $(ref.el).attr(ref.attr, cache.get(abs.href));
      continue;
    }
    const name = safeAssetName(abs.pathname, used);
    const dest = path.join(assetsDir, name);
    const publicPath = `/${deckId}/assets/${name}`;
    try {
      const buf = await downloadAsset(abs, dest);
      if (name.endsWith(".js") && cache.has(logoAbs.href)) {
        fs.writeFileSync(dest, rewriteJsLogoPaths(buf.toString("utf8"), logoPublic), "utf8");
      }
      cache.set(abs.href, publicPath);
      $(ref.el).attr(ref.attr, publicPath);
    } catch (err) {
      console.warn(`[html-import] asset skipped ${abs.href}: ${err.message}`);
    }
  }

  let out = $.html();
  if (cache.has(logoAbs.href)) {
    out = rewriteJsLogoPaths(out, logoPublic);
  }
  const linkOrigin = detectSourceFlavor(html) === "fyh-deck-chrome" ? sourceOrigin : "";
  return rewriteInternalAnchors(out, linkOrigin);
}

export async function prepareImportedHtml({ html, deckId, sourceUrl = "" }) {
  const localized = await localizeHtmlAssets(html, { deckId, sourceUrl });
  return {
    html: localized,
    sourceFlavor: detectSourceFlavor(html),
  };
}
