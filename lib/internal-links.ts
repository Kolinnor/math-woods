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
      select: { id: true, slug: true, language: true, translationGroupId: true },
      orderBy: { id: "asc" }
    });
    const matchedConcept =
      (sourceLanguage ? concepts.find((candidate) => candidate.language === sourceLanguage) : null) ??
      concepts[0];
    const translatedConcept =
      matchedConcept && sourceLanguage && matchedConcept.language !== sourceLanguage
        ? await tx.concept.findFirst({
            where: {
              translationGroupId: matchedConcept.translationGroupId,
              language: sourceLanguage
            },
            select: { slug: true }
          })
        : null;
    const targetSlug = translatedConcept?.slug ?? matchedConcept?.slug ?? link.targetSlug;

    await tx.internalLink.create({
      data: {
        sourceType,
        sourceId,
        targetSlug,
        targetType: matchedConcept ? TargetType.CONCEPT : TargetType.UNKNOWN,
        exists: Boolean(matchedConcept),
        label: link.label
      }
    });
  }
}

async function translationLinkIdentity(
  link: ReturnType<typeof extractWikiLinks>[number],
  preferredLanguage: string,
  tx: Prisma.TransactionClient
) {
  const concepts = await tx.concept.findMany({
    where: {
      OR: [
        { slug: link.targetSlug },
        { title: { equals: link.target, mode: "insensitive" } },
        { aliases: { some: { aliasSlug: link.targetSlug } } }
      ]
    },
    select: { language: true, translationGroupId: true },
    orderBy: { id: "asc" }
  });
  const concept = concepts.find((candidate) => candidate.language === preferredLanguage) ?? concepts[0];
  return concept ? `concept:${concept.translationGroupId}` : `missing:${link.targetSlug}`;
}

export async function assertTranslationWikiLinksPreserved(
  sourceMarkdown: string,
  translatedMarkdown: string,
  sourceLanguage: string,
  translatedLanguage: string,
  tx: Prisma.TransactionClient
) {
  const sourceLinks = extractWikiLinks(sourceMarkdown);
  if (sourceLinks.length === 0) return;

  const translatedLinks = extractWikiLinks(translatedMarkdown);
  const translatedIdentities = new Set(
    await Promise.all(
      translatedLinks.map((link) => translationLinkIdentity(link, translatedLanguage, tx))
    )
  );
  const missingLabels: string[] = [];
  for (const link of sourceLinks) {
    const identity = await translationLinkIdentity(link, sourceLanguage, tx);
    if (!translatedIdentities.has(identity)) missingLabels.push(link.label);
  }

  if (missingLabels.length > 0) {
    throw new Error(
      `Keep every concept link from the source translation. Missing: ${[...new Set(missingLabels)].join(", ")}. You may translate the text after the | character without changing the link target.`
    );
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
  concept: {
    slug: string;
    title: string;
    language: string;
    translationGroupId: string;
    aliases: { aliasSlug: string }[];
  },
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

  const siblingSlugs = (
    await tx.concept.findMany({
      where: { translationGroupId: concept.translationGroupId },
      select: { slug: true }
    })
  ).map(({ slug }) => slug);
  if (siblingSlugs.length <= 1) return;

  const [problemSources, conceptSources, proofSources] = await Promise.all([
    tx.problem.findMany({
      where: { language: concept.language },
      select: { id: true }
    }),
    tx.concept.findMany({
      where: { language: concept.language },
      select: { id: true }
    }),
    tx.problemProof.findMany({
      where: { problem: { language: concept.language } },
      select: { id: true }
    })
  ]);
  const translatedSourceFilters = [
    { sourceType: SourceType.PROBLEM, sourceId: { in: problemSources.map(({ id }) => id) } },
    { sourceType: SourceType.CONCEPT, sourceId: { in: conceptSources.map(({ id }) => id) } },
    { sourceType: SourceType.PROOF, sourceId: { in: proofSources.map(({ id }) => id) } }
  ].filter((filter) => filter.sourceId.in.length > 0);
  if (translatedSourceFilters.length === 0) return;

  const impactedLinks = await tx.internalLink.findMany({
    where: {
      targetSlug: { in: siblingSlugs },
      OR: translatedSourceFilters
    },
    select: { sourceType: true, sourceId: true }
  });
  const impactedKeys = new Set(impactedLinks.map((link) => `${link.sourceType}:${link.sourceId}`));
  const impactedProblemIds = problemSources
    .map(({ id }) => id)
    .filter((id) => impactedKeys.has(`${SourceType.PROBLEM}:${id}`));
  const impactedConceptIds = conceptSources
    .map(({ id }) => id)
    .filter((id) => impactedKeys.has(`${SourceType.CONCEPT}:${id}`));
  const impactedProofIds = proofSources
    .map(({ id }) => id)
    .filter((id) => impactedKeys.has(`${SourceType.PROOF}:${id}`));
  const [impactedProblems, impactedConcepts, impactedProofs] = await Promise.all([
    tx.problem.findMany({
      where: { id: { in: impactedProblemIds } },
      select: { id: true, bodyMarkdown: true }
    }),
    tx.concept.findMany({
      where: { id: { in: impactedConceptIds } },
      select: { id: true, bodyMarkdown: true }
    }),
    tx.problemProof.findMany({
      where: { id: { in: impactedProofIds } },
      select: { id: true, bodyMarkdown: true }
    })
  ]);
  for (const problem of impactedProblems) {
    await syncInternalLinks(SourceType.PROBLEM, problem.id, problem.bodyMarkdown, tx, concept.language);
  }
  for (const sourceConcept of impactedConcepts) {
    await syncInternalLinks(SourceType.CONCEPT, sourceConcept.id, sourceConcept.bodyMarkdown, tx, concept.language);
  }
  for (const proof of impactedProofs) {
    await syncInternalLinks(SourceType.PROOF, proof.id, proof.bodyMarkdown, tx, concept.language);
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
      sourceType: { in: [SourceType.PROBLEM, SourceType.CONCEPT, SourceType.PROOF] }
    },
    orderBy: { createdAt: "desc" }
  });
  const problemIds = [...new Set(links.filter((link) => link.sourceType === SourceType.PROBLEM).map((link) => link.sourceId))];
  const conceptIds = [...new Set(links.filter((link) => link.sourceType === SourceType.CONCEPT).map((link) => link.sourceId))];
  const proofIds = [...new Set(links.filter((link) => link.sourceType === SourceType.PROOF).map((link) => link.sourceId))];
  const [problems, concepts, proofs] = await Promise.all([
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
      : Promise.resolve([]),
    proofIds.length
      ? prisma.problemProof.findMany({
          where: {
            id: { in: proofIds },
            problem: { status: { not: "ARCHIVED" } }
          },
          select: {
            id: true,
            problem: { select: { slug: true, title: true } }
          }
        })
      : Promise.resolve([])
  ]);
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const proofById = new Map(
    proofs.map((proof) => [proof.id, { slug: proof.problem.slug, title: proof.problem.title }])
  );
  const sourcesBySlug = new Map<string, MissingConceptSource[]>();
  const seenSourcesBySlug = new Map<string, Set<string>>();

  for (const link of links) {
    const source =
      link.sourceType === SourceType.PROBLEM
        ? problemById.get(link.sourceId)
        : link.sourceType === SourceType.CONCEPT
          ? conceptById.get(link.sourceId)
          : link.sourceType === SourceType.PROOF
            ? proofById.get(link.sourceId)
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
      href:
        link.sourceType === SourceType.PROBLEM
          ? `/problems/${source.slug}`
          : link.sourceType === SourceType.CONCEPT
            ? `/concepts/${source.slug}`
            : `/problems/${source.slug}#solution-${link.sourceId}`,
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
