import { ensureSlug } from "./slug.ts";

export function parseAliases(input: FormDataEntryValue | null) {
  const aliases = String(input ?? "")
    .split(/[,\n]/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return Array.from(new Map(aliases.map((alias) => [ensureSlug(alias), alias])).entries())
    .filter(([aliasSlug]) => Boolean(aliasSlug))
    .map(([aliasSlug, alias]) => ({ aliasSlug, alias }));
}
