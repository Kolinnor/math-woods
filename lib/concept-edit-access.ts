import { prisma } from "@/lib/db";
import {
  canPublishConceptEditForTarget,
  type PermissionUser
} from "@/lib/permissions";

type ConceptEditAccessTarget = {
  id: number;
  createdById: number | null;
};

export async function canPublishConceptEditForConcept(
  user: PermissionUser,
  concept: ConceptEditAccessTarget
) {
  if (canPublishConceptEditForTarget(user, concept, false)) return true;

  const approvedProposal = await prisma.conceptEditProposal.findFirst({
    where: {
      conceptId: concept.id,
      proposerId: user.id,
      status: "APPROVED"
    },
    select: { id: true }
  });

  return canPublishConceptEditForTarget(user, concept, Boolean(approvedProposal));
}
