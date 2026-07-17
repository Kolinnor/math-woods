import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import { visibleProblemWhere } from "@/lib/problem-visibility";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { rankSearchMatches } from "@/lib/search-ranking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const excludeSlug = url.searchParams.get("exclude")?.trim() ?? "";
  const listedOnly = url.searchParams.get("listed") === "1";

  if (query.length < 2) {
    return NextResponse.json({ problems: [] });
  }

  const language = await getPreferredContentLanguage();
  const user = await getCurrentUser();
  const t = await getTranslations();
  const commonWhere = {
    status: listedOnly ? "PUBLISHED" as const : { not: "ARCHIVED" as const },
    listed: listedOnly ? true : undefined,
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
    language: true
  } as const;
  const [exactProblems, matchingProblems] = await Promise.all([
    prisma.problem.findMany({
      where: {
        ...commonWhere,
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
      OR: [
        {
          language,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { slug: { contains: query.toLowerCase(), mode: "insensitive" } }
          ]
        },
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
    [...new Map([...exactProblems, ...matchingProblems].map((problem) => [problem.id, problem])).values()],
    query,
    language
  ).slice(0, 20);

  return NextResponse.json({
    problems: problems.map((problem) => ({
      id: problem.id,
      title: problem.title,
      slug: problem.slug,
      domainLabel: translatedDomainLabel(problem.domain, t.home.domainLabels),
      difficulty: problem.difficulty,
      listed: problem.listed,
      language: problem.language
    }))
  });
}
