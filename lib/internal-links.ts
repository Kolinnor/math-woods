import { Prisma, SourceType, TargetType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureSlug } from "@/lib/slug";
import { extractWikiLinks } from "@/lib/wikilinks";

export type MissingConceptSource = {
  href: string;
  label: string | null;
  sourceType: SourceType;
  title: string;
};

export type MissingConcept = {
  count: number;
  slug: string;
  sources: MissingConceptSource[];
};

export async function syncInternalLinks(
  sourceType: SourceType,
  sourceId: number,
  markdown: string,
  tx: Prisma.TransactionClient = prisma,
  sourceLanguage?: string
) {
  const links = extractWikiLinks(markdown);

  await tx.internalLink.deleteMany({
    where: { sourceType, sourceId }
  });

  for (const link of links) {
    const concepts = await tx.concept.findMany({
      where: {
        OR: [
          { slug: link.targetSlug },
          { title: { equals: link.target, mode: "insensitive" } },
          { aliases: { some: { aliasSlug: link.targetSlug } } }
        ]
      },
      select: { id: true, slug: true, language: true },
      orderBy: { id: "asc" }
    });
    const concept =
      (sourceLanguage ? concepts.find((candidate) => candidate.language === sourceLanguage) : null) ??
      concepts[0];

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

  await refreshLinksForConceptRecord(concept);
}

export async function refreshLinksForConceptId(
  conceptId: number,
  tx: Prisma.TransactionClient = prisma
) {
  const concept = await tx.concept.findUnique({
    where: { id: conceptId },
    include: { aliases: true }
  });
  if (!concept) return;

  await refreshLinksForConceptRecord(concept, tx);
}

async function refreshLinksForConceptRecord(
  concept: { slug: string; title: string; aliases: { aliasSlug: string }[] },
  tx: Prisma.TransactionClient = prisma
) {
  const titleSlug = ensureSlug(concept.title, "");
  if (titleSlug && titleSlug !== concept.slug) {
    await tx.internalLink.updateMany({
      where: {
        exists: false,
        targetSlug: titleSlug
      },
      data: {
        targetSlug: concept.slug,
        exists: true,
        targetType: TargetType.CONCEPT
      }
    });
  }

  await tx.internalLink.updateMany({
    where: { targetSlug: concept.slug },
    data: {
      exists: true,
      targetType: TargetType.CONCEPT
    }
  });

  for (const alias of concept.aliases) {
    await tx.internalLink.updateMany({
      where: { targetSlug: alias.aliasSlug },
      data: {
        targetSlug: concept.slug,
        exists: true,
        targetType: TargetType.CONCEPT
      }
    });
  }
}

export async function missingConcepts(limit = 20, sourcesPerConcept = 4): Promise<MissingConcept[]> {
  const grouped = await prisma.internalLink.groupBy({
    by: ["targetSlug"],
    where: { exists: false },
    _count: { targetSlug: true },
    orderBy: { _count: { targetSlug: "desc" } },
    take: limit
  });

  const slugs = grouped.map((item) => item.targetSlug);
  if (slugs.length === 0) return [];

  const links = await prisma.internalLink.findMany({
    where: {
      exists: false,
      targetSlug: { in: slugs },
      sourceType: { in: [SourceType.PROBLEM, SourceType.CONCEPT] }
    },
    orderBy: { createdAt: "desc" }
  });
  const problemIds = [...new Set(links.filter((link) => link.sourceType === SourceType.PROBLEM).map((link) => link.sourceId))];
  const conceptIds = [...new Set(links.filter((link) => link.sourceType === SourceType.CONCEPT).map((link) => link.sourceId))];
  const [problems, concepts] = await Promise.all([
    problemIds.length
      ? prisma.problem.findMany({
          where: { id: { in: problemIds }, status: { not: "ARCHIVED" } },
          select: { id: true, slug: true, title: true }
        })
      : Promise.resolve([]),
    conceptIds.length
      ? prisma.concept.findMany({
          where: { id: { in: conceptIds } },
          select: { id: true, slug: true, title: true }
        })
      : Promise.resolve([])
  ]);
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const sourcesBySlug = new Map<string, MissingConceptSource[]>();
  const seenSourcesBySlug = new Map<string, Set<string>>();

  for (const link of links) {
    const source =
      link.sourceType === SourceType.PROBLEM
        ? problemById.get(link.sourceId)
        : link.sourceType === SourceType.CONCEPT
          ? conceptById.get(link.sourceId)
          : null;
    if (!source) continue;

    const seenKey = `${link.sourceType}:${link.sourceId}`;
    const seen = seenSourcesBySlug.get(link.targetSlug) ?? new Set<string>();
    if (seen.has(seenKey)) continue;

    const currentSources = sourcesBySlug.get(link.targetSlug) ?? [];
    if (currentSources.length >= sourcesPerConcept) continue;

    seen.add(seenKey);
    seenSourcesBySlug.set(link.targetSlug, seen);
    currentSources.push({
      href: link.sourceType === SourceType.PROBLEM ? `/problems/${source.slug}` : `/concepts/${source.slug}`,
      label: link.label,
      sourceType: link.sourceType,
      title: source.title
    });
    sourcesBySlug.set(link.targetSlug, currentSources);
  }

  return grouped.map((item) => ({
    slug: item.targetSlug,
    count: item._count.targetSlug,
    sources: sourcesBySlug.get(item.targetSlug) ?? []
  }));
}
