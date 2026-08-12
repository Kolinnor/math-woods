import { prisma } from "@/lib/db";
import {
  canPublishProblemEditForTarget,
  type PermissionUser
} from "@/lib/permissions";

type ProblemEditAccessTarget = {
  id: number;
  authorId: number;
};

export async function canPublishProblemEditForProblem(
  user: PermissionUser,
  problem: ProblemEditAccessTarget
) {
  if (canPublishProblemEditForTarget(user, problem, false)) return true;

  const approvedProposal = await prisma.problemEditProposal.findFirst({
    where: {
      problemId: problem.id,
      proposerId: user.id,
      status: "APPROVED"
    },
    select: { id: true }
  });

  return canPublishProblemEditForTarget(user, problem, Boolean(approvedProposal));
}
