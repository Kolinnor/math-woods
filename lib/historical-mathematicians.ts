import { prisma } from "@/lib/db";

export type HistoricalMathematician = {
  id: number;
  slug: string;
  name: string;
  lifespan: string;
  birthPlace: string;
  portraitUrl: string | null;
};

export async function listHistoricalMathematicians() {
  return prisma.$queryRaw<HistoricalMathematician[]>`
    SELECT "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl"
    FROM "Mathematician"
    ORDER BY "name" ASC
  `;
}

export async function findHistoricalMathematician(slug: string) {
  const matches = await prisma.$queryRaw<HistoricalMathematician[]>`
    SELECT "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl"
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
    RETURNING "id", "slug", "name", "lifespan", "birthPlace", "portraitUrl"
  `;
  const mathematician = matches[0];
  if (!mathematician) throw new Error("The mathematician could not be created.");
  return mathematician;
}
