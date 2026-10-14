export function decodePathSegment(segment) {
  try {
    return decodeURIComponent(String(segment || ""));
  } catch {
    return String(segment || "");
  }
}

export function suggestAsciiSlug(title) {
  return String(title || "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseSourceUrl(raw) {
  const input = String(raw || "").trim();
  if (!input) return { ok: false, error: "請貼上來源網址" };
  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "網址格式無效" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "僅支援 http(s) 網址" };
  }
  const last = url.pathname.split("/").filter(Boolean).pop() || "";
  const fileName = decodePathSegment(last);
  const title = fileName.replace(/\.[^.]+$/, "") || "";
  return {
    ok: true,
    href: url.href,
    fileName,
    title,
    slug: suggestAsciiSlug(title),
  };
}

export function findExistingDeck(decks, { title, deckId } = {}) {
  const list = Array.isArray(decks) ? decks : [];
  if (deckId) {
    const byId = list.find((d) => d.deckId === deckId);
    if (byId) return byId;
  }
  if (title) {
    const needle = String(title).trim();
    return list.find((d) => String(d.title || "").trim() === needle) || null;
  }
  return null;
}
