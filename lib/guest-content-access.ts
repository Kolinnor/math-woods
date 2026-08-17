export const GUEST_CONTENT_VIEW_STORAGE_KEY = "math-woods:guest-content-views";
export const GUEST_CONTENT_VIEW_LIMIT = 3;

export function parseGuestContentViews(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0))];
  } catch {
    return [];
  }
}

export function recordGuestContentView(
  viewedKeys: string[],
  contentKey: string,
  limit = GUEST_CONTENT_VIEW_LIMIT
) {
  const normalizedViews = [...new Set(viewedKeys)];
  const nextViews = normalizedViews.includes(contentKey)
    ? normalizedViews
    : [...normalizedViews, contentKey];

  return {
    viewedKeys: nextViews,
    requiresLogin: nextViews.length >= limit
  };
}
