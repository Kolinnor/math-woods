import { QualityStatus, Role } from "@prisma/client";
import { canModerate } from "./roles.ts";

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
  if (requested === QualityStatus.NEEDS_WORK) return QualityStatus.NEEDS_WORK;
  if (requested === QualityStatus.UNREVIEWED) return QualityStatus.UNREVIEWED;
  if (canModerate(role) && requested === QualityStatus.GOOD) return QualityStatus.GOOD;
  if (canModerate(role) && requested === QualityStatus.EXCELLENT) {
    return QualityStatus.EXCELLENT;
  }
  return QualityStatus.UNREVIEWED;
}
