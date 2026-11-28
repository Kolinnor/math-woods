/** Presses on "I solved it" or "Add to my list" without any "I like this problem" before prompting. */
export const LIKE_PROMPT_PRESS_INTERVAL = 3;

/** Short-lived cookie carrying the translation group to prompt for after a form-based press. */
export const LIKE_PROMPT_COOKIE = "mw_like_prompt";
export const LIKE_PROMPT_COOKIE_MAX_AGE_SECONDS = 120;

/** Counts presses since the latest prompt or like, as "<userId>:<count>". */
export const LIKE_PROMPT_PRESSES_COOKIE = "mw_like_prompt_presses";
export const LIKE_PROMPT_PRESSES_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** True once three presses have accumulated since the latest prompt or like. */
export function isLikePromptDue(pressesSinceLastPrompt: number) {
  return pressesSinceLastPrompt >= LIKE_PROMPT_PRESS_INTERVAL;
}

/** Reads the press counter, ignoring a counter left by another account in this browser. */
export function parseLikePromptPresses(value: string | undefined, userId: number) {
  const [owner, count] = (value ?? "").split(":");
  const presses = Number(count);
  return owner === String(userId) && Number.isInteger(presses) && presses > 0 ? presses : 0;
}

export function formatLikePromptPresses(userId: number, presses: number) {
  return `${userId}:${Math.max(0, presses)}`;
}
