import { QualityStatus, Role } from "@prisma/client";

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

export function qualityDescription(status: QualityStatus) {
  switch (status) {
    case QualityStatus.NEEDS_WORK:
      return "Needs cleanup: source, proof, or wording.";
    case QualityStatus.GOOD:
      return "Readable. No obvious problem.";
    case QualityStatus.EXCELLENT:
      return "Clear, sourced, and carefully checked.";
    case QualityStatus.UNREVIEWED:
    default:
      return "Fresh or lightly reviewed. Read it, try it, improve it.";
  }
}

export function parseContributorQualityStatus(value: FormDataEntryValue | null, role: Role) {
  const requested = String(value ?? QualityStatus.UNREVIEWED).toUpperCase();
  if (requested === QualityStatus.NEEDS_WORK) return QualityStatus.NEEDS_WORK;
  if (requested === QualityStatus.UNREVIEWED) return QualityStatus.UNREVIEWED;
  if ((role === Role.MODERATOR || role === Role.ADMIN) && requested === QualityStatus.GOOD) return QualityStatus.GOOD;
  if ((role === Role.MODERATOR || role === Role.ADMIN) && requested === QualityStatus.EXCELLENT) {
    return QualityStatus.EXCELLENT;
  }
  return QualityStatus.UNREVIEWED;
}
