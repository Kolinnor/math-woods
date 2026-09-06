import type { Prisma } from "@prisma/client";
import { parseProblemCitations, type ProblemCitation } from "./problem-citations.ts";

export async function validateProblemCitations(tx: Prisma.TransactionClient, citations: ProblemCitation[], problemId?: number, historical: readonly number[] = []) {
  parseProblemCitations(citations);
  const ids = citations.flatMap((citation) => citation.referenceId === null ? [] : [citation.referenceId]);
  const [references, existing] = await Promise.all([
    tx.libraryReference.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, searchable: true, mergedIntoId: true } }),
    problemId ? tx.problemLibraryReference.findMany({ where: { problemId }, select: { referenceId: true } }) : []
  ]);
  for (const id of ids) {
    const reference = references.find((item) => item.id === id);
    if (!reference || (!historical.includes(id) && !existing.some((item) => item.referenceId === id) && (reference.status !== "PUBLISHED" || !reference.searchable || reference.mergedIntoId))) {
      throw new Error("This reference is no longer available. Keep it as a free reference or choose another record.");
    }
  }
}

export async function syncProblemCitations(tx: Prisma.TransactionClient, problemId: number, citations: ProblemCitation[], { historical = [] }: { historical?: readonly number[] } = {}) {
  if (historical.length) {
    const present = await tx.libraryReference.findMany({ where: { id: { in: [...historical] } }, select: { id: true } });
    // A deleted historical record still has a readable citation snapshot.
    citations = citations.map((citation) => citation.referenceId !== null && historical.includes(citation.referenceId) && !present.some((ref) => ref.id === citation.referenceId)
      ? { ...citation, referenceId: null } : citation);
  }
  await validateProblemCitations(tx, citations, problemId, historical);
  await tx.problemLibraryReference.deleteMany({ where: { problemId, citationKey: { notIn: citations.map((item) => item.citationKey) } } });
  // Free the unique book links first, so swapping/replacing citations is safe.
  await tx.problemLibraryReference.updateMany({ where: { problemId }, data: { referenceId: null } });
  for (const [position, citation] of citations.entries()) {
    await tx.problemLibraryReference.upsert({
      where: { problemId_citationKey: { problemId, citationKey: citation.citationKey } },
      create: { problemId, ...citation, position },
      update: { ...citation, position }
    });
  }
}
