import { prisma } from "@/lib/db";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { selectContentTranslation } from "@/lib/translation-routing";

/** An alias names a concept family, even when only one translation records it. */
export async function matchingConceptAliasGroups(variants: readonly string[], exact = false) {
  if (!variants.length) return new Map<string, string[]>();
  const rows = await prisma.conceptAlias.findMany({
    where: {
      OR: variants.map((value) => ({ alias: exact
        ? { equals: value, mode: "insensitive" as const }
        : { contains: value, mode: "insensitive" as const } })),
      concept: { language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) } }
    },
    select: { alias: true, concept: { select: { translationGroupId: true } } }
  });
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const aliases = groups.get(row.concept.translationGroupId) ?? [];
    if (!aliases.includes(row.alias)) aliases.push(row.alias);
    groups.set(row.concept.translationGroupId, aliases);
  }
  return groups;
}

export function conceptSearchAliases(
  concept: { translationGroupId: string; aliases: readonly { alias: string }[] },
  matchedGroups: ReadonlyMap<string, readonly string[]>
) {
  return [...new Set([
    ...concept.aliases.map(({ alias }) => alias),
    ...(matchedGroups.get(concept.translationGroupId) ?? [])
  ])];
}

export async function resolveConceptAlias(slug: string, language: string) {
  const alias = await prisma.conceptAlias.findFirst({
    where: { aliasSlug: slug },
    select: { concept: { select: { translationGroupId: true } } }
  });
  if (!alias) return null;
  const translations = await prisma.concept.findMany({
    where: {
      translationGroupId: alias.concept.translationGroupId,
      language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) }
    },
    select: { slug: true, language: true, translatedFromConceptId: true },
    orderBy: { id: "asc" }
  });
  return selectContentTranslation(translations.map((concept) => ({
    ...concept, isSource: concept.translatedFromConceptId === null
  })), language);
}
