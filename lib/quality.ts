import { QualityStatus, Role } from "@prisma/client";
import { canSetProblemQualityStatus } from "./permissions.ts";

export function qualityLabel(status: QualityStatus) {
  switch (status) {
    case QualityStatus.NEEDS_WORK:
      return "Needs work";
    case QualityStatus.GOOD:
      return "Good";
    case QualityStatus.EXCELLENT:
      return "Excellent";
    case QualityStatus.UNREVIEWED:
    default:
      return "Unreviewed";
  }
}

export function parseContributorQualityStatus(value: FormDataEntryValue | null, role: Role) {
  const requested = String(value ?? QualityStatus.UNREVIEWED).toUpperCase();
  if (Object.values(QualityStatus).includes(requested as QualityStatus)) {
    const status = requested as QualityStatus;
    if (canSetProblemQualityStatus(role, status)) return status;
  }
  return QualityStatus.UNREVIEWED;
}
