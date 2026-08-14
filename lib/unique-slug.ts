import { prisma } from "@/lib/db";
import { historicalMathematicianSlugExists } from "@/lib/historical-mathematicians";
import { ensureSlug } from "@/lib/slug";

type SlugModel = "problem" | "concept" | "playlist" | "quote" | "mathematician";

export async function uniqueSlug(model: SlugModel, title: string, preferredSuffix?: string): Promise<string> {
  const base = ensureSlug(title);
  let slug = base;
  let suffix = 2;

  if (!(await findBySlug(model, slug))) return slug;

  const normalizedPreferredSuffix = preferredSuffix ? ensureSlug(preferredSuffix, "") : "";
  const collisionBase = normalizedPreferredSuffix ? `${base}-${normalizedPreferredSuffix}` : base;
  slug = normalizedPreferredSuffix ? collisionBase : `${collisionBase}-${suffix++}`;

  while (await findBySlug(model, slug)) {
    slug = `${collisionBase}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function findBySlug(model: SlugModel, slug: string) {
  if (model === "problem") {
    return prisma.problem.findUnique({ where: { slug }, select: { id: true } });
  }
  if (model === "concept") {
    return prisma.concept.findUnique({ where: { slug }, select: { id: true } });
  }
  if (model === "quote") {
    return prisma.quote.findUnique({ where: { slug }, select: { id: true } });
  }
  if (model === "mathematician") {
    return historicalMathematicianSlugExists(slug);
  }
  return prisma.playlist.findUnique({ where: { slug }, select: { id: true } });
}
