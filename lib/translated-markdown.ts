import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
import { renderMarkdown } from "@/lib/markdown";
import { selectContentTranslationsByGroup, selectContentTranslation } from "@/lib/translation-routing";
import { extractWikiLinks } from "@/lib/wikilinks";

type ResolvedConcept = {
  language: string;
  slug: string;
  translationGroupId: string;
  isSource?: boolean;
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
      translationGroupId: { in: [...new Set(concepts.map((concept) => concept.translationGroupId))] }
    },
    select: { slug: true, language: true, translationGroupId: true, translatedFromConceptId: true }
  });
  const translatedSlugByGroup = new Map(
    selectContentTranslationsByGroup(
      translatedConcepts.map((concept) => ({
        ...concept,
        isSource: concept.translatedFromConceptId === null
      })),
      targetLanguage
    ).map((concept) => [concept.translationGroupId, concept.slug])
  );

  return new Map(
    concepts.map((concept) => [
      concept.slug,
      `/concepts/${translatedSlugByGroup.get(concept.translationGroupId) ?? concept.slug}`
    ])
  );
}

export async function resolveConceptTitlesForLanguage(slugs: readonly string[], language: string) {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return new Map<string, string>();

  const targetLanguage = parseContentLanguage(language);
  const concepts = await prisma.concept.findMany({
    where: { slug: { in: uniqueSlugs } },
    select: { slug: true, title: true, translationGroupId: true }
  });
  if (concepts.length === 0) return new Map<string, string>();

  const translatedConcepts = await prisma.concept.findMany({
    where: {
      translationGroupId: { in: [...new Set(concepts.map((concept) => concept.translationGroupId))] }
    },
    select: {
      title: true,
      language: true,
      translationGroupId: true,
      translatedFromConceptId: true
    }
  });
  const translatedTitleByGroup = new Map(
    selectContentTranslationsByGroup(
      translatedConcepts.map((concept) => ({
        ...concept,
        isSource: concept.translatedFromConceptId === null
      })),
      targetLanguage
    ).map((concept) => [concept.translationGroupId, concept.title])
  );

  return new Map(
    concepts.map((concept) => [
      concept.slug,
      translatedTitleByGroup.get(concept.translationGroupId) ?? concept.title
    ])
  );
}

export async function renderMarkdownCollectionForContentLanguage(
  markdowns: readonly string[],
  language: string
) {
  if (markdowns.length === 0) return [];

  const targetLanguage = parseContentLanguage(language);
  const links = markdowns.flatMap((markdown) => extractWikiLinks(markdown));
  const targetSlugs = [...new Set(links.map((link) => link.targetSlug))];
  const targetTitles = [...new Set(links.map((link) => link.target.trim()).filter(Boolean))];

  if (targetSlugs.length === 0) {
    return Promise.all(markdowns.map((markdown) => renderMarkdown(markdown)));
  }

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
      translatedFromConceptId: true,
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
    const candidate = {
      ...concept,
      isSource: concept.translatedFromConceptId === null
    };
    if (targetSlugs.includes(concept.slug)) {
      addConceptCandidate(concept.slug, candidate);
    }
    for (const alias of concept.aliases) {
      addConceptCandidate(alias.aliasSlug, candidate);
    }
    for (const link of links) {
      if (concept.title.toLowerCase() === link.target.trim().toLowerCase()) {
        addConceptCandidate(link.targetSlug, candidate);
      }
    }
  }
  for (const [lookupSlug, candidates] of conceptCandidatesByLookupSlug) {
    conceptByLookupSlug.set(
      lookupSlug,
      selectContentTranslation(candidates, targetLanguage) ?? candidates[0]
    );
  }

  const translationGroups = [...new Set(concepts.map((concept) => concept.translationGroupId))];
  const translatedConcepts = translationGroups.length
      ? await prisma.concept.findMany({
        where: {
          translationGroupId: { in: translationGroups }
        },
        select: { slug: true, language: true, translationGroupId: true, translatedFromConceptId: true }
      })
    : [];
  const translatedSlugByGroup = new Map(
    selectContentTranslationsByGroup(
      translatedConcepts.map((concept) => ({
        ...concept,
        isSource: concept.translatedFromConceptId === null
      })),
      targetLanguage
    ).map((concept) => [concept.translationGroupId, concept.slug])
  );
  const missingSlugs = new Set(targetSlugs.filter((slug) => !conceptByLookupSlug.has(slug)));

  return Promise.all(
    markdowns.map((markdown) =>
      renderMarkdown(markdown, missingSlugs, true, (link) => {
        const concept = conceptByLookupSlug.get(link.targetSlug);
        if (!concept) return `/concepts/${link.targetSlug}`;

        return `/concepts/${translatedSlugByGroup.get(concept.translationGroupId) ?? concept.slug}`;
      })
    )
  );
}

export async function renderMarkdownForContentLanguage(markdown: string, language: string) {
  const [html] = await renderMarkdownCollectionForContentLanguage([markdown], language);
  return html;
}
