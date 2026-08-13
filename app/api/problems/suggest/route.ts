import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import { visibleProblemWhere } from "@/lib/problem-visibility";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { rankSearchMatches } from "@/lib/search-ranking";
import { renderInlineMarkdown } from "@/lib/markdown";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { selectContentTranslationsByGroup } from "@/lib/translation-routing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const excludeSlug = url.searchParams.get("exclude")?.trim() ?? "";
  const listedOnly = url.searchParams.get("listed") === "1";
  const exerciseFilter = url.searchParams.get("exercise");

  if (query.length < 2) {
    return NextResponse.json({ problems: [] });
  }

  const language = await getPreferredContentLanguage();
  const user = await getCurrentUser();
  const t = await getTranslations();
  const commonWhere = {
    status: listedOnly ? "PUBLISHED" as const : { not: "ARCHIVED" as const },
    listed: listedOnly ? true : undefined,
    isExercise: exerciseFilter === "1" ? true : exerciseFilter === "0" ? false : undefined,
    slug: excludeSlug ? { not: excludeSlug } : undefined,
    ...visibleProblemWhere(user)
  };
  const problemSelect = {
    id: true,
    title: true,
    slug: true,
    domain: true,
    difficulty: true,
    listed: true,
    language: true,
    translationGroupId: true,
    translatedFromProblemId: true
  } as const;
  const [exactProblems, matchingProblems] = await Promise.all([
    prisma.problem.findMany({
      where: {
        ...commonWhere,
        language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
        OR: [
          { title: { equals: query, mode: "insensitive" } },
          { slug: { equals: query.toLowerCase(), mode: "insensitive" } }
        ]
      },
      select: problemSelect,
      take: 20
    }),
    prisma.problem.findMany({
    where: {
      ...commonWhere,
      language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { slug: { contains: query.toLowerCase(), mode: "insensitive" } }
      ]
    },
    select: problemSelect,
    orderBy: { title: "asc" },
    take: 100
    })
  ]);
  const problems = rankSearchMatches(
    selectContentTranslationsByGroup(
      [...new Map([...exactProblems, ...matchingProblems].map((problem) => [problem.id, problem])).values()]
        .map((problem) => ({
          ...problem,
          isSource: problem.translatedFromProblemId === null
        })),
      language
    ),
    query,
    language
  ).slice(0, 20);

  return NextResponse.json({
    problems: await Promise.all(problems.map(async (problem) => ({
      id: problem.id,
      title: problem.title,
      titleHtml: await renderInlineMarkdown(problem.title),
      slug: problem.slug,
      domainLabel: translatedDomainLabel(problem.domain, t.home.domainLabels),
      difficulty: problem.difficulty,
      translationGroupId: problem.translationGroupId,
      listed: problem.listed,
      language: problem.language
    })))
  });
}
