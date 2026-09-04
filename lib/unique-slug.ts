import { prisma } from "@/lib/db";
import { historicalMathematicianSlugExists } from "@/lib/historical-mathematicians";
import { ensureSlug } from "@/lib/slug";

type SlugModel = "problem" | "concept" | "playlist" | "quote" | "mathematician" | "libraryReference" | "historyMilestone";

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
    const [concept, alias, redirect] = await Promise.all([
      prisma.concept.findUnique({ where: { slug }, select: { id: true } }),
      prisma.conceptAlias.findUnique({ where: { aliasSlug: slug }, select: { id: true } }),
      prisma.conceptRedirect.findUnique({ where: { sourceSlug: slug }, select: { id: true } })
    ]);
    return concept ?? alias ?? redirect;
  }
  if (model === "quote") {
    return prisma.quote.findUnique({ where: { slug }, select: { id: true } });
  }
  if (model === "mathematician") {
    return historicalMathematicianSlugExists(slug);
  }
  if (model === "libraryReference") {
    return prisma.libraryReference.findUnique({ where: { slug }, select: { id: true } });
  }
  if (model === "historyMilestone") {
    return prisma.historyMilestone.findUnique({ where: { slug }, select: { id: true } });
  }
  return prisma.playlist.findUnique({ where: { slug }, select: { id: true } });
}
