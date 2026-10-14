function categoryActive(categories, categoryId) {
  if (!categoryId) return true;
  const category = (categories || []).find((item) => item.id === categoryId);
  return Boolean(category && category.isActive !== false);
}

function compareDecks(a, b) {
  const order = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
  if (order) return order;
  return String(a.title || a.deckId || "").localeCompare(String(b.title || b.deckId || ""), "zh-Hant");
}

function compareCategories(a, b) {
  const order = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
  if (order) return order;
  return String(a.name || a.id || "").localeCompare(String(b.name || b.id || ""), "zh-Hant");
}

export function publicDecks(registry) {
  const categories = registry?.categories || [];
  return (registry?.decks || []).filter(
    (deck) => deck.listed === true && categoryActive(categories, deck.categoryId || "")
  );
}

export function groupPublicCatalog(registry, { query = "", categoryId = "all" } = {}) {
  const categories = [...(registry?.categories || [])]
    .filter((item) => item.isActive !== false)
    .sort(compareCategories);
  const q = String(query || "").trim().toLowerCase();
  const selected = String(categoryId || "all");

  let decks = publicDecks(registry).filter((deck) => {
    const deckCategory = deck.categoryId || "";
    if (selected === "uncategorized" && deckCategory) return false;
    if (selected !== "all" && selected !== "uncategorized" && deckCategory !== selected) return false;
    if (!q) return true;
    const category = categories.find((item) => item.id === deck.categoryId);
    const hay = `${deck.title || ""} ${deck.deckId || ""} ${deck.summary || ""} ${deck.lead || ""} ${category?.name || ""}`.toLowerCase();
    return hay.includes(q);
  });
  decks = [...decks].sort(compareDecks);

  const groups = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description || "",
      sortOrder: category.sortOrder || 0,
      decks: decks.filter((deck) => deck.categoryId === category.id),
    }))
    .filter((group) => group.decks.length);

  const uncategorized = decks.filter((deck) => !deck.categoryId);
  if (uncategorized.length && (selected === "all" || selected === "uncategorized")) {
    groups.push({
      id: "",
      name: "未分類",
      description: "",
      sortOrder: 10000,
      decks: uncategorized,
    });
  }

  return groups;
}
