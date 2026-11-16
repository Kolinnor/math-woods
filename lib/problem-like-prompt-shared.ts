/** Number of consecutive solves without any "I like this problem" before prompting. */
export const LIKE_PROMPT_SOLVE_INTERVAL = 3;

/** Short-lived cookie carrying the translation group to prompt for after a form-based solve. */
export const LIKE_PROMPT_COOKIE = "mw_like_prompt";
export const LIKE_PROMPT_COOKIE_MAX_AGE_SECONDS = 120;

/** True on the 3rd, 6th, 9th... solved problem since the user's latest like. */
export function isLikePromptDue(solvesSinceLastLike: number) {
  return solvesSinceLastLike > 0 && solvesSinceLastLike % LIKE_PROMPT_SOLVE_INTERVAL === 0;
}

/** Avoid nagging readers: at most one invitation per day in this browser. */
export const LIKE_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export function likePromptCooldownElapsed(lastShown: string | null, now: number) {
  if (lastShown === null) return true;
  const timestamp = Number(lastShown);
  return !Number.isFinite(timestamp) || timestamp > now || now - timestamp >= LIKE_PROMPT_COOLDOWN_MS;
}
