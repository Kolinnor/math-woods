import { createHash } from "node:crypto";

export const CREATION_SUBMISSION_FIELD = "creationSubmission";

const CREATION_SUBMISSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export function creationSubmissionKey(
  scope: string,
  userId: number,
  value: FormDataEntryValue | null
) {
  if (typeof value !== "string" || !CREATION_SUBMISSION_PATTERN.test(value)) return null;
  return createHash("sha256")
    .update(`${scope}:${userId}:${value}`)
    .digest("hex");
}
