import type { KnownProblemSource } from "@prisma/client";
import { isUnknownProblemOrigin } from "./problem-origin.ts";

export type KnownProblemSourceIdentity = Pick<KnownProblemSource, "name" | "aliases">;

export function normalizeKnownProblemSourceName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function parseKnownProblemSourceAliases(value: unknown) {
  const aliases = String(value ?? "")
    .split(/[\n,]+/)
    .map((alias) => alias.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  const uniqueAliases = new Map<string, string>();
  for (const alias of aliases) {
    const normalized = normalizeKnownProblemSourceName(alias);
    if (!uniqueAliases.has(normalized)) uniqueAliases.set(normalized, alias);
  }
  return [...uniqueAliases.values()];
}

export function knownProblemSourceNames(source: KnownProblemSourceIdentity) {
  return [source.name, ...source.aliases];
}

export function problemOriginMatchesKnownSource(origin: unknown, source: KnownProblemSourceIdentity) {
  const normalizedOrigin = normalizeKnownProblemSourceName(origin);
  return Boolean(
    normalizedOrigin
    && knownProblemSourceNames(source).some(
      (candidate) => normalizeKnownProblemSourceName(candidate) === normalizedOrigin
    )
  );
}

export function problemSourcePresentation(
  origin: unknown,
  source: KnownProblemSourceIdentity | null | undefined
) {
  const hasFreeSource = !isUnknownProblemOrigin(origin);
  const knownSourceDuplicatesFreeSource = Boolean(
    source && problemOriginMatchesKnownSource(origin, source)
  );
  const sourceCount = (source ? 1 : 0) + (hasFreeSource && !knownSourceDuplicatesFreeSource ? 1 : 0);
  return { hasFreeSource, knownSourceDuplicatesFreeSource, sourceCount };
}

export function parseKnownProblemSourceId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function normalizeKnownProblemSourceIconUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;

  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Use the clearer validation message below.
  }

  throw new Error("The source pictogram must use a local path or a secure https URL.");
}
