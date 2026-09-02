import { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function contentParticipantIds({
  pageType,
  pageId,
  primaryAuthorId,
  actorId
}: {
  pageType: SourceType;
  pageId: number;
  primaryAuthorId: number | null;
  actorId: number;
}) {
  const editors = await prisma.pageRevision.findMany({
    where: { pageType, pageId, editedById: { not: null } },
    distinct: ["editedById"],
    select: { editedById: true }
  });
  const ids = new Set<number>(editors.map((editor) => editor.editedById!));
  if (primaryAuthorId !== null) ids.add(primaryAuthorId);
  ids.delete(actorId);
  return [...ids];
}
