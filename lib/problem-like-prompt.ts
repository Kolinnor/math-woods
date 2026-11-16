import { prisma } from "@/lib/db";
import { isLikePromptDue } from "@/lib/problem-like-prompt-shared";

export { LIKE_PROMPT_COOKIE, LIKE_PROMPT_COOKIE_MAX_AGE_SECONDS } from "@/lib/problem-like-prompt-shared";

/**
 * Whether a user who has just solved a problem should be invited to like it.
 * Only solved problems the user has not liked count (per translation family,
 * own problems excluded), starting after their most recent like; the prompt
 * appears when the just-solved, not-yet-liked problem completes a run of three.
 */
export async function shouldPromptLikeAfterSolve(userId: number, translationGroupId: string) {
  const likes = await prisma.problemFavorite.findMany({
    where: { userId },
    select: { createdAt: true, problem: { select: { translationGroupId: true } } }
  });
  const likedGroups = new Set(likes.map((like) => like.problem.translationGroupId));
  if (likedGroups.has(translationGroupId)) return false;
  const lastLikeAt = likes.reduce<Date | null>(
    (latest, like) => (!latest || like.createdAt > latest ? like.createdAt : latest),
    null
  );

  const solved = await prisma.problemAttempt.findMany({
    where: {
      userId,
      status: "SOLVED",
      ...(lastLikeAt ? { solvedAt: { gt: lastLikeAt } } : {}),
      problem: { authorId: { not: userId } }
    },
    select: { problem: { select: { translationGroupId: true } } }
  });
  const unlikedSolvedGroups = new Set(
    solved
      .map((attempt) => attempt.problem.translationGroupId)
      .filter((group) => !likedGroups.has(group))
  );
  if (!unlikedSolvedGroups.has(translationGroupId)) return false;
  return isLikePromptDue(unlikedSolvedGroups.size);
}
