import { ReportCategory, Role } from "@prisma/client";

export const SOLUTION_REPORT_CATEGORIES = [
  ReportCategory.MATHEMATICAL_ERROR,
  ReportCategory.INCOMPLETE_ARGUMENT,
  ReportCategory.UNCLEAR_EXPLANATION,
  ReportCategory.IRRELEVANT_OR_ABUSIVE,
  ReportCategory.OTHER
] as const;

export function parseSolutionReportCategory(value: FormDataEntryValue | string | null | undefined) {
  const category = String(value ?? "") as ReportCategory;
  if (!SOLUTION_REPORT_CATEGORIES.includes(category)) {
    throw new Error("Choose a valid solution report reason.");
  }
  return category;
}

export function solutionReportCategoryLabel(category: ReportCategory) {
  switch (category) {
    case ReportCategory.MATHEMATICAL_ERROR:
      return "mathematical error";
    case ReportCategory.INCOMPLETE_ARGUMENT:
      return "incomplete argument";
    case ReportCategory.UNCLEAR_EXPLANATION:
      return "unclear explanation";
    case ReportCategory.IRRELEVANT_OR_ABUSIVE:
      return "irrelevant or inappropriate content";
    case ReportCategory.OTHER:
      return "other issue";
  }
}

export function solutionConcernIsPublic(reporterRoles: readonly Role[]) {
  return (
    reporterRoles.length >= 2 ||
    reporterRoles.some((role) => role === Role.MODERATOR || role === Role.ADMIN || role === Role.OWNER)
  );
}
