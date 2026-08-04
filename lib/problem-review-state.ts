import { QualityStatus } from "@prisma/client";

const PROBLEM_REVIEW_SENSITIVE_FIELDS = new Set(["title", "bodyMarkdown"]);

export function hasProblemReviewSensitiveChanges(changedFields: readonly string[]) {
  return changedFields.some((field) => PROBLEM_REVIEW_SENSITIVE_FIELDS.has(field));
}

export function needsReviewAfterProblemEdit({
  alreadyNeedsReview,
  currentStatus,
  hasReviewSensitiveChanges
}: {
  alreadyNeedsReview: boolean;
  currentStatus: QualityStatus;
  hasReviewSensitiveChanges: boolean;
}) {
  return (
    alreadyNeedsReview ||
    (currentStatus === QualityStatus.REVIEWED && hasReviewSensitiveChanges)
  );
}
