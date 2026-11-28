import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  formatLikePromptPresses,
  isLikePromptDue,
  LIKE_PROMPT_COOKIE,
  LIKE_PROMPT_COOKIE_MAX_AGE_SECONDS,
  LIKE_PROMPT_PRESSES_COOKIE,
  LIKE_PROMPT_PRESSES_COOKIE_MAX_AGE_SECONDS,
  parseLikePromptPresses
} from "@/lib/problem-like-prompt-shared";

export { LIKE_PROMPT_COOKIE, LIKE_PROMPT_COOKIE_MAX_AGE_SECONDS } from "@/lib/problem-like-prompt-shared";

const cookieOptions = (maxAge: number, httpOnly: boolean) => ({
  httpOnly,
  maxAge,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production"
});

/** A user can be invited to like a problem only if it is not theirs and not already liked. */
async function canBeInvitedToLike(userId: number, translationGroupId: string) {
  const [ownProblem, like] = await Promise.all([
    prisma.problem.findFirst({ where: { translationGroupId, authorId: userId }, select: { id: true } }),
    prisma.problemFavorite.findFirst({ where: { userId, problem: { translationGroupId } }, select: { problemId: true } })
  ]);
  return !ownProblem && !like;
}

/**
 * Counts a press on "I solved it" or "Add to my list". On the third press since the
 * latest invitation or like, and for a problem the user can like, it leaves a
 * short-lived marker so the page shows the "Did you enjoy this problem?" invitation.
 * When the problem cannot be liked, the invitation waits for the next eligible press.
 */
export async function registerLikePromptPress(userId: number, translationGroupId: string) {
  const store = await cookies();
  const presses = parseLikePromptPresses(store.get(LIKE_PROMPT_PRESSES_COOKIE)?.value, userId) + 1;
  const prompt = isLikePromptDue(presses) && (await canBeInvitedToLike(userId, translationGroupId));
  store.set(
    LIKE_PROMPT_PRESSES_COOKIE,
    formatLikePromptPresses(userId, prompt ? 0 : presses),
    cookieOptions(LIKE_PROMPT_PRESSES_COOKIE_MAX_AGE_SECONDS, true)
  );
  if (prompt) {
    store.set(LIKE_PROMPT_COOKIE, translationGroupId, cookieOptions(LIKE_PROMPT_COOKIE_MAX_AGE_SECONDS, false));
  }
}

/** Liking any problem starts a new count. */
export async function resetLikePromptPresses(userId: number) {
  (await cookies()).set(
    LIKE_PROMPT_PRESSES_COOKIE,
    formatLikePromptPresses(userId, 0),
    cookieOptions(LIKE_PROMPT_PRESSES_COOKIE_MAX_AGE_SECONDS, true)
  );
}
