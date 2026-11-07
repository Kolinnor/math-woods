import type { Prisma } from "@prisma/client";
import type { ReferenceAuthorInput } from "./reference-authors.ts";

export async function validateReferenceAuthors(tx: Prisma.TransactionClient, entries: ReferenceAuthorInput[], userId: number, locale: string, referenceId?: number) {
  const ids = entries.flatMap(row => row.mathematicianId === null ? [] : [row.mathematicianId]);
  if (!ids.length) return;
  // Existing links survive an archive; new links use the same visibility as the picker.
  const existing = referenceId ? await tx.libraryReferenceAuthor.findMany({ where: { referenceId }, select: { mathematicianId: true } }) : [];
  const people = await tx.mathematician.findMany({ where: { id: { in: ids }, OR: [
    { status: "PUBLISHED" },
    { createdById: userId, status: { in: ["DRAFT", "PENDING_REVIEW", "NEEDS_WORK"] } },
    { id: { in: existing.flatMap(row => row.mathematicianId === null ? [] : [row.mathematicianId]) } }
  ] }, select: { id: true } });
  if (people.length !== ids.length) throw new Error(locale === "fr" ? "Un mathématicien sélectionné n’est plus disponible. Retirez-le ou passez son nom en saisie libre." : "A selected mathematician is no longer available. Remove them or use a free author name.");
}
