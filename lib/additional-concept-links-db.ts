import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { extractConceptReferences } from "./concept-link-references.ts";

// Resolve stored slugs through renames/merges and select the page's language.
export async function resolveAdditionalConceptLinks(slugs: string[], language: string, tx: Prisma.TransactionClient = prisma) {
  if (!slugs.length) return [];
  const select = { id: true, slug: true, title: true, language: true, translationGroupId: true } as const;
  const [concepts, redirects] = await Promise.all([
    tx.concept.findMany({ where: { OR: [{ slug: { in: slugs } }, { aliases: { some: { aliasSlug: { in: slugs } } } }, { title: { in: slugs, mode: "insensitive" } }] }, select: { ...select, aliases: { select: { aliasSlug: true } } } }),
    tx.conceptRedirect.findMany({ where: { sourceSlug: { in: slugs } }, select: { sourceSlug: true, targetConcept: { select } } })
  ]);
  const matched = slugs.flatMap(slug => {
    const concept = redirects.find(row => row.sourceSlug === slug)?.targetConcept ?? concepts.find(row => row.slug === slug) ??
      concepts.find(row => row.language === language && row.aliases.some(alias => alias.aliasSlug === slug)) ??
      concepts.find(row => row.aliases.some(alias => alias.aliasSlug === slug)) ??
      concepts.find(row => row.title.toLowerCase() === slug.toLowerCase() && row.language === language) ??
      concepts.find(row => row.title.toLowerCase() === slug.toLowerCase());
    return concept ? [concept] : [];
  });
  const translations = await tx.concept.findMany({ where: { translationGroupId: { in: matched.map(row => row.translationGroupId) }, language }, select });
  return [...new Map(matched.map(row => {
    const localized = translations.find(candidate => candidate.translationGroupId === row.translationGroupId) ?? row;
    return [localized.translationGroupId, localized] as const;
  })).values()];
}

export async function uncitedAdditionalConceptLinks(slugs: string[], markdown: string, language: string, tx: Prisma.TransactionClient = prisma) {
  if (!slugs.length) return [];
  const references = extractConceptReferences(markdown);
  const [additional, cited] = await Promise.all([
    resolveAdditionalConceptLinks(slugs, language, tx),
    resolveAdditionalConceptLinks([...new Set(references.flatMap(link => [link.targetSlug, link.target]))], language, tx)
  ]);
  const citedGroups = new Set(cited.map(row => row.translationGroupId));
  return additional.filter(row => !citedGroups.has(row.translationGroupId));
}
