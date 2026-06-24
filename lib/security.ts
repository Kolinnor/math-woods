export function sanitizeReportPath(value: unknown, maxLength = 600) {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  try {
    const isRelative = raw.startsWith("/");
    const parsed = new URL(raw, isRelative ? "https://mathwoods.local" : undefined);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";

    const safePath = isRelative ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
    return safePath.slice(0, maxLength) || "/";
  } catch {
    const withoutQuery = raw.split(/[?#]/, 1)[0]?.trim();
    return (withoutQuery || "/").slice(0, maxLength);
  }
}
