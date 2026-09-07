export const CONCEPTS_PER_PAGE = 75;

export function conceptPagination(rawPage: unknown, total: number) {
  const requested = typeof rawPage === "string" && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const totalPages = Math.max(1, Math.ceil(total / CONCEPTS_PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const skip = (page - 1) * CONCEPTS_PER_PAGE;
  return { page, totalPages, skip, from: total ? skip + 1 : 0, to: Math.min(skip + CONCEPTS_PER_PAGE, total) };
}

export function conceptPageHref(query: Record<string, string | string[] | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "page") continue;
    for (const item of Array.isArray(value) ? value : [value]) if (item) params.append(key, item);
  }
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/concepts${suffix ? `?${suffix}` : ""}#concept-results`;
}
