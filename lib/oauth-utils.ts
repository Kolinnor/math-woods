export type OAuthProviderKey = "google" | "orcid";

export function parseOAuthProvider(value: string): OAuthProviderKey | null {
  return value === "google" || value === "orcid" ? value : null;
}

export function safeReturnTo(value: string | null | undefined, fallback = "/") {
  const target = value?.trim();
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return fallback;
  try {
    const base = new URL("https://mathwoods.invalid");
    const resolved = new URL(target, base);
    return resolved.origin === base.origin ? `${resolved.pathname}${resolved.search}${resolved.hash}` : fallback;
  } catch {
    return fallback;
  }
}
