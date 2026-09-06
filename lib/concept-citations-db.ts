import type { Prisma } from "@prisma/client";
import { parseConceptCitations } from "./concept-citations.ts";
import type { ProblemCitation } from "./problem-citations.ts";

export async function validateConceptCitations(tx: Prisma.TransactionClient, citations: ProblemCitation[], conceptId?: number, historical: readonly number[] = []) {
  parseConceptCitations(citations);
  const ids = citations.flatMap(c => c.referenceId === null ? [] : [c.referenceId]);
  const [references, existing] = await Promise.all([
    tx.libraryReference.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, searchable: true, mergedIntoId: true } }),
    conceptId ? tx.conceptLibraryReference.findMany({ where: { conceptId }, select: { referenceId: true } }) : []
  ]);
  for (const id of ids) {
    const reference = references.find(r => r.id === id);
    if (!reference || (!historical.includes(id) && !existing.some(r => r.referenceId === id) && (reference.status !== "PUBLISHED" || !reference.searchable || reference.mergedIntoId))) throw new Error("This reference is no longer available. Keep it as a free reference or choose another record.");
  }
}

export async function syncConceptCitations(tx: Prisma.TransactionClient, conceptId: number, input: ProblemCitation[], historical: readonly number[] = []) {
  let citations = parseConceptCitations(input);
  if (historical.length) {
    const present = await tx.libraryReference.findMany({ where: { id: { in: [...historical] } }, select: { id: true } });
    citations = citations.map(c => c.referenceId !== null && historical.includes(c.referenceId) && !present.some(r => r.id === c.referenceId) ? { ...c, referenceId: null } : c);
  }
  await validateConceptCitations(tx, citations, conceptId, historical);
  await tx.conceptLibraryReference.deleteMany({ where: { conceptId, citationKey: { notIn: citations.map(c => c.citationKey) } } });
  await tx.conceptLibraryReference.updateMany({ where: { conceptId }, data: { referenceId: null } });
  for (const [position, { isPrimary: _primary, spoiler: _spoiler, ...citation }] of citations.entries()) {
    await tx.conceptLibraryReference.upsert({ where: { conceptId_citationKey: { conceptId, citationKey: citation.citationKey } }, create: { conceptId, ...citation, position }, update: { ...citation, position } });
  }
  // Keep the old plain-text representation readable by legacy snapshots and tools.
  await tx.conceptReference.deleteMany({ where: { conceptId } });
  if (citations.length) await tx.conceptReference.createMany({ data: citations.map((c, position) => ({ conceptId, title: c.text, url: c.url, note: [c.locator, c.note].filter(Boolean).join("\n\n") || null, position })) });
}
