import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { rankSearchMatches } from "@/lib/search-ranking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";

  if (query.length < 2) {
    return NextResponse.json({ concepts: [] });
  }

  const language = await getPreferredContentLanguage();
  const conceptSelect = {
    title: true,
    slug: true,
    aliases: { select: { alias: true } }
  } as const;
  const [exactConcepts, matchingConcepts] = await Promise.all([
    prisma.concept.findMany({
      where: {
        language,
        OR: [
          { title: { equals: query, mode: "insensitive" } },
          { slug: { equals: query.toLowerCase(), mode: "insensitive" } },
          { aliases: { some: { alias: { equals: query, mode: "insensitive" } } } }
        ]
      },
      select: conceptSelect,
      take: 20
    }),
    prisma.concept.findMany({
    where: {
      language,
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
  const concepts = rankSearchMatches(
    [...new Map([...exactConcepts, ...matchingConcepts].map((concept) => [concept.slug, concept])).values()].map((concept) => ({
      ...concept,
      aliases: concept.aliases.map((alias) => alias.alias)
    })),
    query
  ).slice(0, 20);

  return NextResponse.json({
    concepts: concepts.map((concept) => ({
      title: concept.title,
      slug: concept.slug,
      aliases: concept.aliases
    }))
  });
}
