function categoryName(registry, categoryId) {
  if (!categoryId) return "未分類";
  return registry.categories.find((item) => item.id === categoryId)?.name || categoryId;
}

export function catalogFromRegistry(registry) {
  const data = registry && typeof registry === "object" ? registry : { decks: [], categories: [] };
  const decks = Array.isArray(data.decks) ? data.decks : [];
  const categories = (Array.isArray(data.categories) ? data.categories : [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description || "",
      sortOrder: Number(category.sortOrder) || 0,
      isActive: category.isActive !== false,
      deckCount: decks.filter((deck) => deck.categoryId === category.id).length,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), "zh-Hant"));

  return {
    categories,
    decks: decks.map((deck) => ({
      deckId: deck.deckId,
      title: deck.title || deck.deckId,
      sourceType: deck.sourceType || "html",
      slideCount: 0,
      scriptsReady: 0,
      audioReady: 0,
      staleCount: 0,
      hasHtml: true,
      publishedAt: null,
      publishedUrl: null,
      updatedAt: deck.updatedAt || deck.createdAt || null,
      categoryId: deck.categoryId || "",
      categoryName: categoryName(data, deck.categoryId),
      listed: deck.listed === true,
      sortOrder: Number(deck.sortOrder) || 0,
      summary: deck.summary || "",
      statusChips: ["已上傳"],
    })),
  };
}
