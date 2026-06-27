import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";

  if (query.length < 2) {
    return NextResponse.json({ concepts: [] });
  }

  const language = await getPreferredContentLanguage();
  const concepts = await prisma.concept.findMany({
    where: {
      language,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { slug: { contains: query.toLowerCase(), mode: "insensitive" } },
        { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }
      ]
    },
    select: {
      title: true,
      slug: true,
      aliases: {
        select: { alias: true },
        take: 4
      }
    },
    orderBy: { title: "asc" },
    take: 8
  });

  return NextResponse.json({
    concepts: concepts.map((concept) => ({
      title: concept.title,
      slug: concept.slug,
      aliases: concept.aliases.map((alias) => alias.alias)
    }))
  });
}
