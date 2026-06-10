import { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";
import { ensureSlug } from "./slug.ts";

export type ParsedTag = {
  name: string;
  slug: string;
};

export const DIFFICULTY_TAG_SLUGS = new Set([
  "easy",
  "facile",
  "beginner",
  "debutant",
  "intermediate",
  "medium",
  "moyen",
  "hard",
  "difficult",
  "difficile",
  "advanced",
  "expert",
  "l1"
]);

export function parseTagInput(input: string): ParsedTag[] {
  const seen = new Set<string>();
  const tags: ParsedTag[] = [];

  for (const raw of input.split(/[,\n]+/)) {
    const name = raw.trim().replace(/^#/, "");
    const slug = ensureSlug(name, "tag");

    if (!name || seen.has(slug) || DIFFICULTY_TAG_SLUGS.has(slug)) continue;
    seen.add(slug);
    tags.push({ name, slug });
  }

  return tags;
}

export async function syncProblemTags(
  problemId: number,
  input: string,
  tx: Prisma.TransactionClient = prisma
) {
  const tags = parseTagInput(input);

  await tx.problemTag.deleteMany({ where: { problemId } });

  for (const tag of tags) {
    const stored = await tx.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: { slug: tag.slug, name: tag.name }
    });

    await tx.problemTag.create({
      data: {
        problemId,
        tagId: stored.id
      }
    });
  }
}
