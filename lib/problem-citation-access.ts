import { prisma } from "@/lib/db";
import { canEditProblem, type PermissionUser } from "@/lib/permissions";

export async function canRevealProblemCitations(user: PermissionUser | null, problem: { authorId: number; translationGroupId: string }) {
  if (!user) return false;
  if (canEditProblem(user, problem)) return true;
  return Boolean(await prisma.problemAttempt.findFirst({
    where: { userId: user.id, status: "SOLVED", problem: { translationGroupId: problem.translationGroupId } },
    select: { id: true }
  }));
}
