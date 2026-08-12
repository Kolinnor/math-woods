import { PrismaClient } from "@prisma/client";
import { extractWikiLinks } from "../lib/wikilinks.ts";

const prisma = new PrismaClient();

function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function main() {
  const concepts = await prisma.concept.findMany({
    select: {
      title: true,
      slug: true,
      language: true,
      translationGroupId: true,
      aliases: { select: { aliasSlug: true } }
    }
  });

  let canonicalLinks = 0;
  let titleLinks = 0;
  let aliasLinks = 0;

  for (const concept of concepts) {
    const titleSlug = slugify(concept.title);
    if (titleSlug && titleSlug !== concept.slug) {
      const titleResult = await prisma.internalLink.updateMany({
        where: {
          exists: false,
          targetSlug: titleSlug
        },
        data: {
          targetSlug: concept.slug,
          exists: true,
          targetType: "CONCEPT"
        }
      });
      titleLinks += titleResult.count;
    }

    const canonicalResult = await prisma.internalLink.updateMany({
      where: {
        exists: false,
        targetSlug: concept.slug
      },
      data: {
        exists: true,
        targetType: "CONCEPT"
      }
    });
    canonicalLinks += canonicalResult.count;

    for (const alias of concept.aliases) {
      const aliasResult = await prisma.internalLink.updateMany({
        where: {
          exists: false,
          targetSlug: alias.aliasSlug
        },
        data: {
          exists: true,
          targetType: "CONCEPT"
        }
      });
      aliasLinks += aliasResult.count;
    }
  }

  const candidatesByLookup = new Map();
  const addCandidate = (lookup, concept) => {
    const candidates = candidatesByLookup.get(lookup) ?? [];
    if (!candidates.some((candidate) => candidate.slug === concept.slug)) candidates.push(concept);
    candidatesByLookup.set(lookup, candidates);
  };
  for (const concept of concepts) {
    addCandidate(concept.slug, concept);
    addCandidate(slugify(concept.title), concept);
    for (const alias of concept.aliases) addCandidate(alias.aliasSlug, concept);
  }

  const [problems, conceptPages, proofs] = await Promise.all([
    prisma.problem.findMany({
      select: { id: true, bodyMarkdown: true, language: true }
    }),
    prisma.concept.findMany({
      select: { id: true, bodyMarkdown: true, language: true }
    }),
    prisma.problemProof.findMany({
      select: {
        id: true,
        bodyMarkdown: true,
        problem: { select: { language: true } }
      }
    })
  ]);
  const sourcePages = [
    ...problems.map((problem) => ({ ...problem, sourceType: "PROBLEM" })),
    ...conceptPages.map((concept) => ({ ...concept, sourceType: "CONCEPT" })),
    ...proofs.map((proof) => ({
      id: proof.id,
      bodyMarkdown: proof.bodyMarkdown,
      language: proof.problem.language,
      sourceType: "PROOF"
    }))
  ];
  const indexedLinks = [];
  for (const source of sourcePages) {
    for (const link of extractWikiLinks(source.bodyMarkdown)) {
      const candidates = candidatesByLookup.get(link.targetSlug) ?? [];
      const matchedConcept = candidates.find((candidate) => candidate.language === source.language) ?? candidates[0];
      const translatedConcept = matchedConcept
        ? concepts.find(
            (concept) =>
              concept.translationGroupId === matchedConcept.translationGroupId &&
              concept.language === source.language
          )
        : null;
      indexedLinks.push({
        sourceType: source.sourceType,
        sourceId: source.id,
        targetSlug: translatedConcept?.slug ?? matchedConcept?.slug ?? link.targetSlug,
        targetType: matchedConcept ? "CONCEPT" : "UNKNOWN",
        exists: Boolean(matchedConcept),
        label: link.label
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.internalLink.deleteMany({
      where: { sourceType: { in: ["PROBLEM", "CONCEPT", "PROOF"] } }
    });
    if (indexedLinks.length > 0) {
      await tx.internalLink.createMany({ data: indexedLinks, skipDuplicates: true });
    }
  });

  console.log(
    `Internal link reconciliation complete. Canonical links fixed: ${canonicalLinks}. Title links fixed: ${titleLinks}. Alias links fixed: ${aliasLinks}. Content links indexed: ${indexedLinks.length}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
