import { createHash } from "node:crypto";

export const PROBLEM_CHALLENGE_INVITE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type ProblemChallengeInviteError = "problemUnavailable" | "rateLimited";

export function normalizeProblemChallengeInviteToken(value: string | null | undefined) {
  const token = value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}

export function problemChallengeInviteTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function problemChallengeInvitePath(token: string) {
  return `/challenge/${encodeURIComponent(token)}`;
}
