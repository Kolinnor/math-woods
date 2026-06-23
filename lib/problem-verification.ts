import { ProblemVerificationMode } from "@prisma/client";

export const VERIFICATION_MODE_LABELS: Record<ProblemVerificationMode, string> = {
  NONE: "No verification",
  SELF_CHECK: "Short answer check",
  AUTHOR_REVIEW: "Author review"
};

export function parseProblemVerificationMode(value: FormDataEntryValue | null): ProblemVerificationMode {
  const input = String(value ?? "").toUpperCase() as ProblemVerificationMode;
  return Object.values(ProblemVerificationMode).includes(input) ? input : ProblemVerificationMode.NONE;
}

export function normalizeVerificationAnswer(answer: string) {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export function verificationMatches(expected: string | null, submitted: string) {
  if (!expected) return false;
  return normalizeVerificationAnswer(expected) === normalizeVerificationAnswer(submitted);
}
