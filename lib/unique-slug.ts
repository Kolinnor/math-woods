import { prisma } from "@/lib/db";
import { ensureSlug } from "@/lib/slug";

type SlugModel = "problem" | "concept" | "playlist" | "quote";

export async function uniqueSlug(model: SlugModel, title: string): Promise<string> {
  const base = ensureSlug(title);
  let slug = base;
  let suffix = 2;

  while (await findBySlug(model, slug)) {
    slug = `${base}-${suffix}`;
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
  return prisma.playlist.findUnique({ where: { slug }, select: { id: true } });
}
