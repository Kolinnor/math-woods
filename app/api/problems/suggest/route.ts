import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const excludeSlug = url.searchParams.get("exclude")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ problems: [] });
  }

  const language = await getPreferredContentLanguage();
  const problems = await prisma.problem.findMany({
    where: {
      status: { not: "ARCHIVED" },
      slug: excludeSlug ? { not: excludeSlug } : undefined,
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
    select: {
      title: true,
      slug: true,
      difficulty: true,
      listed: true,
      language: true
    },
    orderBy: [{ language: "asc" }, { title: "asc" }],
    take: 10
  });

  return NextResponse.json({
    problems: problems.map((problem) => ({
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty,
      listed: problem.listed,
      language: problem.language
    }))
  });
}
