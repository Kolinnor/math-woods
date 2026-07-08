import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
import { renderMarkdown } from "@/lib/markdown";
import { extractWikiLinks } from "@/lib/wikilinks";

type ResolvedConcept = {
  language: string;
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
  const targetTitles = [...new Set(links.map((link) => link.target.trim()).filter(Boolean))];

  if (targetSlugs.length === 0) return renderMarkdown(markdown);

  const concepts = await prisma.concept.findMany({
    where: {
      OR: [
        { slug: { in: targetSlugs } },
        { aliases: { some: { aliasSlug: { in: targetSlugs } } } },
        ...targetTitles.map((title) => ({ title: { equals: title, mode: "insensitive" as const } }))
      ]
    },
    select: {
      title: true,
      language: true,
      slug: true,
      translationGroupId: true,
      aliases: {
        where: { aliasSlug: { in: targetSlugs } },
        select: { aliasSlug: true }
      }
    }
  });

  const conceptCandidatesByLookupSlug = new Map<string, ResolvedConcept[]>();
  const addConceptCandidate = (lookupSlug: string, concept: ResolvedConcept) => {
    conceptCandidatesByLookupSlug.set(lookupSlug, [
      ...(conceptCandidatesByLookupSlug.get(lookupSlug) ?? []),
      concept
    ]);
  };

  const conceptByLookupSlug = new Map<string, ResolvedConcept>();
  for (const concept of concepts) {
    if (targetSlugs.includes(concept.slug)) {
      addConceptCandidate(concept.slug, concept);
    }
    for (const alias of concept.aliases) {
      addConceptCandidate(alias.aliasSlug, concept);
    }
    for (const link of links) {
      if (concept.title.toLowerCase() === link.target.trim().toLowerCase()) {
        addConceptCandidate(link.targetSlug, concept);
      }
    }
  }
  for (const [lookupSlug, candidates] of conceptCandidatesByLookupSlug) {
    conceptByLookupSlug.set(
      lookupSlug,
      candidates.find((candidate) => candidate.language === targetLanguage) ?? candidates[0]
    );
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
