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

  const proofs = await prisma.problemProof.findMany({
    select: {
      id: true,
      bodyMarkdown: true,
      problem: { select: { language: true } }
    }
  });
  const proofLinks = [];
  for (const proof of proofs) {
    for (const link of extractWikiLinks(proof.bodyMarkdown)) {
      const candidates = candidatesByLookup.get(link.targetSlug) ?? [];
      const concept = candidates.find((candidate) => candidate.language === proof.problem.language) ?? candidates[0];
      proofLinks.push({
        sourceType: "PROOF",
        sourceId: proof.id,
        targetSlug: concept?.slug ?? link.targetSlug,
        targetType: concept ? "CONCEPT" : "UNKNOWN",
        exists: Boolean(concept),
        label: link.label
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.internalLink.deleteMany({ where: { sourceType: "PROOF" } });
    if (proofLinks.length > 0) {
      await tx.internalLink.createMany({ data: proofLinks, skipDuplicates: true });
    }
  });

  console.log(
    `Internal link reconciliation complete. Canonical links fixed: ${canonicalLinks}. Title links fixed: ${titleLinks}. Alias links fixed: ${aliasLinks}. Solution links indexed: ${proofLinks.length}.`
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
