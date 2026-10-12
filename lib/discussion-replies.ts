import { prisma } from "@/lib/db";
import type { DiscussionTarget } from "@/lib/discussion-follow-policy";
import { canEditProblem, canViewArchivedProblem, type PermissionUser } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";
import { canViewProblemSolutions } from "@/lib/problem-solution-visibility";

/** Resolve the recipient on the server, only inside the discussion being posted to. */
export async function resolveDiscussionReply(target: DiscussionTarget, value: FormDataEntryValue | null, user: PermissionUser) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("Invalid reply target.");
  }
  const id = Number(value);
  if (target.kind !== "concept") {
    const proof = target.kind === "proof"
      ? await prisma.problemProof.findUnique({ where: { id: target.id }, include: { problem: true } })
      : null;
    const problem = target.kind === "problem"
      ? await prisma.problem.findUnique({ where: { id: target.id } }) : proof?.problem;
    if (!problem || !canViewProblem(user, problem) || (problem.status === "ARCHIVED" && !canViewArchivedProblem(user, problem))) {
      throw new Error("Discussion not found.");
    }
    if (target.kind === "proof") {
      const solved = await prisma.problemAttempt.findFirst({
        where: { userId: user.id, status: "SOLVED", problem: { translationGroupId: problem.translationGroupId } },
        select: { id: true }
      });
      if (!canViewProblemSolutions({
        requiresVerification: problem.verificationMode !== "NONE",
        hasSolvedAttempt: Boolean(solved),
        canEditProblem: canEditProblem(user, problem)
      })) throw new Error("Discussion not found.");
    }
  }
  const select = { id: true, authorId: true };
  const parent = target.kind === "problem"
    ? await prisma.discussionPost.findFirst({ where: { id, deletedAt: null, thread: { problemId: target.id } }, select })
    : target.kind === "proof"
      ? await prisma.proofComment.findFirst({ where: { id, deletedAt: null, proofId: target.id }, select })
      : await prisma.conceptTalkPost.findFirst({ where: { id, deletedAt: null, conceptId: target.id }, select });
  if (!parent) throw new Error("Reply target is no longer available in this discussion.");
  return parent;
}
