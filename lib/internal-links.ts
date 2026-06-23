import { Prisma, SourceType, TargetType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { extractWikiLinks } from "@/lib/wikilinks";

export async function syncInternalLinks(
  sourceType: SourceType,
  sourceId: number,
  markdown: string,
  tx: Prisma.TransactionClient = prisma
) {
  const links = extractWikiLinks(markdown);

  await tx.internalLink.deleteMany({
    where: { sourceType, sourceId }
  });

  for (const link of links) {
    const concept = await tx.concept.findFirst({
      where: {
        OR: [{ slug: link.targetSlug }, { aliases: { some: { aliasSlug: link.targetSlug } } }]
      },
      select: { id: true, slug: true }
    });

    await tx.internalLink.create({
      data: {
        sourceType,
        sourceId,
        targetSlug: concept?.slug ?? link.targetSlug,
        targetType: concept ? TargetType.CONCEPT : TargetType.UNKNOWN,
        exists: Boolean(concept),
        label: link.label
      }
    });
  }
}

export async function refreshLinksForConcept(slug: string) {
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: { aliases: true }
  });
  if (!concept) return;

  await prisma.internalLink.updateMany({
    where: { targetSlug: slug },
    data: {
      exists: true,
      targetType: TargetType.CONCEPT
    }
  });

  for (const alias of concept.aliases) {
    await prisma.internalLink.updateMany({
      where: { targetSlug: alias.aliasSlug },
      data: {
        targetSlug: slug,
        exists: true,
        targetType: TargetType.CONCEPT
      }
    });
  }
}

export async function missingConcepts(limit = 20) {
  const grouped = await prisma.internalLink.groupBy({
    by: ["targetSlug"],
    where: { exists: false },
    _count: { targetSlug: true },
    orderBy: { _count: { targetSlug: "desc" } },
    take: limit
  });

  return grouped.map((item) => ({
    slug: item.targetSlug,
    count: item._count.targetSlug
  }));
}
