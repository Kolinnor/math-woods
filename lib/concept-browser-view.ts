// Map/List choice on /concepts. An explicit ?view= wins (shareable links, no-JS fallback),
// then the remembered cookie, then the map, which is the default home of the concepts.

export const CONCEPT_BROWSER_VIEW_COOKIE = "math-woods-concepts-view";
export const CONCEPT_BROWSER_VIEW_PARAM = "view";
export const CONCEPT_BROWSER_VIEWS = ["map", "list"] as const;

export type ConceptBrowserView = (typeof CONCEPT_BROWSER_VIEWS)[number];

export function parseConceptBrowserView(value: unknown): ConceptBrowserView | null {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  return (CONCEPT_BROWSER_VIEWS as readonly string[]).includes(normalized) ? (normalized as ConceptBrowserView) : null;
}

export function resolveConceptBrowserView(param: unknown, cookieValue: unknown): ConceptBrowserView {
  return parseConceptBrowserView(param) ?? parseConceptBrowserView(cookieValue) ?? "map";
}

export function conceptBrowserViewCookie(view: ConceptBrowserView, secure: boolean) {
  return `${CONCEPT_BROWSER_VIEW_COOKIE}=${view}; Max-Age=31536000; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Link to a view. Going back to the list restores the filters remembered by LiveSearchForm
 * for this tab, so that the switch does not lose a search in progress.
 */
export function conceptBrowserViewHref(view: ConceptBrowserView, savedListQuery?: string | null) {
  const params = new URLSearchParams(view === "list" && savedListQuery ? savedListQuery : "");
  params.delete("page");
  params.set(CONCEPT_BROWSER_VIEW_PARAM, view);
  return `/concepts?${params.toString()}`;
}

/** Data of the map, in tiers: the concepts drawn on the whole map first, then one zoom level at a time. */
export function conceptMapDataHref(language: string, tier: number) {
  return `/api/concepts/map?lang=${encodeURIComponent(language)}&tier=${tier}`;
}
