export type OAuthProviderKey = "google" | "orcid" | "github";

export function parseOAuthProvider(value: string): OAuthProviderKey | null {
  return value === "google" || value === "orcid" || value === "github" ? value : null;
}

export type GithubEmail = {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
};

export function selectVerifiedGithubEmail(emails: GithubEmail[]): string | null {
  let firstVerified: string | null = null;
  for (const entry of emails) {
    if (entry.verified !== true || typeof entry.email !== "string") continue;
    const email = entry.email.trim().toLowerCase();
    if (!email.includes("@")) continue;
    if (entry.primary === true) return email;
    firstVerified ??= email;
  }
  return firstVerified;
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
