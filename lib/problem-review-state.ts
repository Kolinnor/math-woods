import { QualityStatus } from "@prisma/client";

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
