export type LibraryQuery = Record<string, string | string[] | undefined>;
export const libraryQueryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function libraryCatalogueHref(path: string, query: LibraryQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item) params.append(key, item);
  }
  return `${path}${params.size ? `?${params}` : ""}`;
}

/** Return links may only point to the catalogue that owns this entry. */
export function libraryReturnHref(value: string | undefined, catalogue: string) {
  if (!value || !value.startsWith(`${catalogue}?`)) return catalogue;
  try {
    const url = new URL(value, "https://mathwoods.invalid");
    if (url.origin !== "https://mathwoods.invalid" || url.pathname !== catalogue) return catalogue;
    const query = new URLSearchParams();
    for (const key of ["q", "era", "type", "sort", "language", "page", "viewLanguage"]) {
      const item = url.searchParams.get(key);
      if (item) query.set(key, item.slice(0, 160));
    }
    return `${catalogue}${query.size ? `?${query}` : ""}`;
  } catch { return catalogue; }
}

export function libraryReferenceSummary(entry: { authors: string | null; yearLabel: string | null; year: number | null; publisher: string | null }) {
  return [entry.authors?.replace(/\s*\n\s*/g, ", "), entry.yearLabel || entry.year?.toString(), entry.publisher].filter(Boolean).join(" · ");
}
