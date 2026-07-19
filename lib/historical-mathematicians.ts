import { prisma } from "@/lib/db";

export type HistoricalMathematician = {
  id: number;
  slug: string;
  name: string;
  lifespan: string;
  birthPlace: string;
  portraitUrl: string | null;
  contentMarkdown: string;
  contentHtml: string;
};

export async function listHistoricalMathematicians() {
  return prisma.$queryRaw<HistoricalMathematician[]>`
    SELECT "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl", "contentMarkdown", "contentHtml"
    FROM "Mathematician"
    ORDER BY "name" ASC
  `;
}

export async function findHistoricalMathematician(slug: string) {
  const matches = await prisma.$queryRaw<HistoricalMathematician[]>`
    SELECT "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl", "contentMarkdown", "contentHtml"
    FROM "Mathematician"
    WHERE "slug" = ${slug}
    LIMIT 1
  `;
  return matches[0] ?? null;
}

export async function historicalMathematicianSlugExists(slug: string) {
  const matches = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT "id"
    FROM "Mathematician"
    WHERE "slug" = ${slug}
    LIMIT 1
  `;
  return matches.length > 0;
}

export async function insertHistoricalMathematician(input: {
  slug: string;
  name: string;
  lifespan: string;
  birthPlace: string;
  portraitUrl: string | null;
  createdById: number;
}) {
  const matches = await prisma.$queryRaw<HistoricalMathematician[]>`
    INSERT INTO "Mathematician" (
      "slug", "name", "lifespan", "birthPlace", "portraitUrl", "createdById", "updatedAt"
    ) VALUES (
      ${input.slug}, ${input.name}, ${input.lifespan}, ${input.birthPlace}, ${input.portraitUrl}, ${input.createdById}, NOW()
    )
    RETURNING "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl", "contentMarkdown", "contentHtml"
  `;
  const mathematician = matches[0];
  if (!mathematician) throw new Error("The mathematician could not be created.");
  return mathematician;
}

export async function updateHistoricalMathematician(input: {
  id: number;
  name: string;
  lifespan: string;
  birthPlace: string;
  portraitUrl: string | null;
  contentMarkdown: string;
  contentHtml: string;
}) {
  const matches = await prisma.$queryRaw<HistoricalMathematician[]>`
    UPDATE "Mathematician"
    SET
      "name" = ${input.name},
      "lifespan" = ${input.lifespan},
      "birthPlace" = ${input.birthPlace},
      "portraitUrl" = ${input.portraitUrl},
      "contentMarkdown" = ${input.contentMarkdown},
      "contentHtml" = ${input.contentHtml},
      "updatedAt" = NOW()
    WHERE "id" = ${input.id}
    RETURNING "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl", "contentMarkdown", "contentHtml"
  `;
  const mathematician = matches[0];
  if (!mathematician) throw new Error("Mathematician not found.");
  return mathematician;
}
