"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { DiscussionTarget } from "@/lib/discussion-follow-policy";
import { canEditProblem, canViewArchivedProblem } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";
import { canViewProblemSolutions } from "@/lib/problem-solution-visibility";
import { assertRateLimit } from "@/lib/rate-limit";

export async function setDiscussionFollowingAction(target: DiscussionTarget, following: boolean) {
  const user = await requireUser();
  await assertRateLimit(`discussion-follow:${user.id}`, 30, 60_000);
  if (!target || !["problem", "proof", "concept"].includes(target.kind) || !Number.isSafeInteger(target.id) || target.id <= 0 || typeof following !== "boolean") {
    throw new Error("Invalid discussion preference.");
  }
  if (target.kind === "concept") {
    const concept = await prisma.concept.findUnique({ where: { id: target.id }, select: { slug: true } });
    if (!concept) throw new Error("Discussion not found.");
    await prisma.discussionFollow.upsert({
      where: { userId_conceptId: { userId: user.id, conceptId: target.id } },
      create: { userId: user.id, conceptId: target.id, following },
      update: { following }
    });
    revalidatePath(`/concepts/${concept.slug}/talk`);
    return;
  }
  const proof = target.kind === "proof"
    ? await prisma.problemProof.findUnique({ where: { id: target.id }, include: { problem: true } })
    : null;
  const problem = target.kind === "problem"
    ? await prisma.problem.findUnique({ where: { id: target.id } })
    : proof?.problem;
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
  await prisma.discussionFollow.upsert({
    where: target.kind === "problem"
      ? { userId_problemId: { userId: user.id, problemId: target.id } }
      : { userId_proofId: { userId: user.id, proofId: target.id } },
    create: { userId: user.id, following, ...(target.kind === "problem" ? { problemId: target.id } : { proofId: target.id }) },
    update: { following }
  });
  revalidatePath(target.kind === "problem"
    ? `/problems/${problem.slug}/discussion`
    : `/problems/${problem.slug}/proofs/${target.id}/discussion`);
}
