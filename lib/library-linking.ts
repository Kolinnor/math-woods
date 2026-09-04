import { LibraryReferenceRole, LibraryStatus, type Prisma } from "@prisma/client";
import { CONTENT_LIMITS, optionalBoundedText } from "@/lib/content-limits";

type DbClient = Prisma.TransactionClient;

export type SubmittedLibraryReferenceLink = {
  referenceId: number;
  role: LibraryReferenceRole;
  locator: string | null;
  note: string | null;
  isPrimary: boolean;
};

export function parseLibraryReferenceLinks(formData: FormData, allowPrimary: boolean): SubmittedLibraryReferenceLink[] {
  const ids = [...new Set(formData.getAll("libraryReferenceIds").map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const primaryId = allowPrimary ? Number(formData.get("libraryPrimaryReferenceId")) : 0;
  return ids.map((referenceId) => {
    const rawRole = String(formData.get(`libraryReferenceRole-${referenceId}`) ?? "");
    const role = Object.values(LibraryReferenceRole).includes(rawRole as LibraryReferenceRole)
      ? rawRole as LibraryReferenceRole
      : allowPrimary ? LibraryReferenceRole.SOURCE : LibraryReferenceRole.FURTHER_READING;
    return {
      referenceId,
      role,
      locator: optionalBoundedText(formData.get(`libraryReferenceLocator-${referenceId}`), CONTENT_LIMITS.shortText, "Reference location"),
      note: optionalBoundedText(formData.get(`libraryReferenceNote-${referenceId}`), CONTENT_LIMITS.longNote, "Reference note"),
      isPrimary: allowPrimary && referenceId === primaryId
    };
  });
}

export async function validateLibraryReferenceLinks(tx: DbClient, links: SubmittedLibraryReferenceLink[]) {
  if (!links.length) return;
  const count = await tx.libraryReference.count({ where: { id: { in: links.map((link) => link.referenceId) }, status: LibraryStatus.PUBLISHED } });
  if (count !== links.length) throw new Error("One of the selected references is no longer available.");
}

export async function syncProblemLibraryReferences(tx: DbClient, problemId: number, links: SubmittedLibraryReferenceLink[]) {
  await validateLibraryReferenceLinks(tx, links);
  await tx.problemLibraryReference.deleteMany({ where: { problemId } });
  if (links.length) await tx.problemLibraryReference.createMany({ data: links.map((link, position) => ({ problemId, ...link, position })) });
}

export async function syncConceptLibraryReferences(tx: DbClient, conceptId: number, links: SubmittedLibraryReferenceLink[]) {
  await validateLibraryReferenceLinks(tx, links);
  await tx.conceptLibraryReference.deleteMany({ where: { conceptId } });
  if (links.length) await tx.conceptLibraryReference.createMany({ data: links.map(({ isPrimary: _isPrimary, ...link }, position) => ({ conceptId, ...link, position })) });
}
