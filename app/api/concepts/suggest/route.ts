import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { rankSearchMatches, searchMorphologyVariants } from "@/lib/search-ranking";
import { ensureSlug } from "@/lib/slug";
import { renderInlineMarkdown } from "@/lib/markdown";
import { selectContentTranslationsByGroup } from "@/lib/translation-routing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const includeAllLanguages = url.searchParams.get("all") === "1";

  if (query.length < 2) {
    return NextResponse.json({ concepts: [] });
  }

  const language = await getPreferredContentLanguage();
  const morphologyVariants = searchMorphologyVariants(query, language);
  const morphologySlugs = [...new Set(morphologyVariants.map((variant) => ensureSlug(variant, "")).filter(Boolean))];
  const conceptSelect = {
    title: true,
    slug: true,
    language: true,
    translationGroupId: true,
    translatedFromConceptId: true,
    aliases: { select: { alias: true } }
  } as const;
  const [exactConcepts, matchingConcepts] = await Promise.all([
    prisma.concept.findMany({
      where: {
        language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
        OR: [
          { title: { in: morphologyVariants, mode: "insensitive" } },
          { slug: { in: morphologySlugs, mode: "insensitive" } },
          { aliases: { some: { alias: { in: morphologyVariants, mode: "insensitive" } } } }
        ]
      },
      select: conceptSelect,
      take: 20
    }),
    prisma.concept.findMany({
    where: {
      language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { slug: { contains: query.toLowerCase(), mode: "insensitive" } },
        { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }
      ]
    },
    select: conceptSelect,
    orderBy: { title: "asc" },
    take: 100
    })
  ]);
  const rankedCandidates = [...new Map([...exactConcepts, ...matchingConcepts].map((concept) => [concept.slug, concept])).values()]
    .map((concept) => ({
      ...concept,
      aliases: concept.aliases.map((alias) => alias.alias),
      isSource: concept.translatedFromConceptId === null
    }));
  const concepts = rankSearchMatches(
    includeAllLanguages ? rankedCandidates : selectContentTranslationsByGroup(rankedCandidates, language),
    query,
    undefined,
    morphologyVariants
  ).slice(0, 20);

  return NextResponse.json({
    concepts: await Promise.all(concepts.map(async (concept) => ({
      title: concept.title,
      titleHtml: await renderInlineMarkdown(concept.title),
      slug: concept.slug,
      language: concept.language,
      aliases: concept.aliases
    })))
  });
}
