import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
import { renderMarkdown } from "@/lib/markdown";
import { extractWikiLinks } from "@/lib/wikilinks";

type ResolvedConcept = {
  slug: string;
  translationGroupId: string;
};

export async function resolveConceptHrefsForLanguage(slugs: readonly string[], language: string) {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return new Map<string, string>();

  const targetLanguage = parseContentLanguage(language);
  const concepts = await prisma.concept.findMany({
    where: { slug: { in: uniqueSlugs } },
    select: { slug: true, translationGroupId: true }
  });
  if (concepts.length === 0) return new Map<string, string>();

  const translatedConcepts = await prisma.concept.findMany({
    where: {
      translationGroupId: { in: [...new Set(concepts.map((concept) => concept.translationGroupId))] },
      language: targetLanguage
    },
    select: { slug: true, translationGroupId: true }
  });
  const translatedSlugByGroup = new Map(
    translatedConcepts.map((concept) => [concept.translationGroupId, concept.slug])
  );

  return new Map(
    concepts.map((concept) => [
      concept.slug,
      `/concepts/${translatedSlugByGroup.get(concept.translationGroupId) ?? concept.slug}`
    ])
  );
}

export async function renderMarkdownForContentLanguage(markdown: string, language: string) {
  const targetLanguage = parseContentLanguage(language);
  const links = extractWikiLinks(markdown);
  const targetSlugs = [...new Set(links.map((link) => link.targetSlug))];

  if (targetSlugs.length === 0) return renderMarkdown(markdown);

  const concepts = await prisma.concept.findMany({
    where: {
      OR: [{ slug: { in: targetSlugs } }, { aliases: { some: { aliasSlug: { in: targetSlugs } } } }]
    },
    select: {
      slug: true,
      translationGroupId: true,
      aliases: {
        where: { aliasSlug: { in: targetSlugs } },
        select: { aliasSlug: true }
      }
    }
  });

  const conceptByLookupSlug = new Map<string, ResolvedConcept>();
  for (const concept of concepts) {
    if (targetSlugs.includes(concept.slug)) {
      conceptByLookupSlug.set(concept.slug, concept);
    }
    for (const alias of concept.aliases) {
      conceptByLookupSlug.set(alias.aliasSlug, concept);
    }
  }

  const translationGroups = [...new Set(concepts.map((concept) => concept.translationGroupId))];
  const translatedConcepts = translationGroups.length
    ? await prisma.concept.findMany({
        where: {
          translationGroupId: { in: translationGroups },
          language: targetLanguage
        },
        select: { slug: true, translationGroupId: true }
      })
    : [];
  const translatedSlugByGroup = new Map(
    translatedConcepts.map((concept) => [concept.translationGroupId, concept.slug])
  );
  const missingSlugs = new Set(targetSlugs.filter((slug) => !conceptByLookupSlug.has(slug)));

  return renderMarkdown(markdown, missingSlugs, true, (link) => {
    const concept = conceptByLookupSlug.get(link.targetSlug);
    if (!concept) return `/concepts/${link.targetSlug}`;

    return `/concepts/${translatedSlugByGroup.get(concept.translationGroupId) ?? concept.slug}`;
  });
}
