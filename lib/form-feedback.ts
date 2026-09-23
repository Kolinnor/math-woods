import { CONTENT_LIMITS } from "./content-limits.ts";

export class EditSummaryValidationError extends Error {
  constructor() {
    super("Edit summary is too long.");
    this.name = "EditSummaryValidationError";
  }
}

export function parseEditSummary(value: unknown) {
  const summary = typeof value === "string" ? value.trim() : "";
  if (summary.length > CONTENT_LIMITS.shortText) throw new EditSummaryValidationError();
  return summary;
}

export function editSummaryValidationMessage(locale: "fr" | "en") {
  return locale === "fr"
    ? `Le résumé ne doit pas dépasser ${CONTENT_LIMITS.shortText} caractères. Raccourcissez-le puis réessayez ; votre saisie est conservée.`
    : `The summary must not exceed ${CONTENT_LIMITS.shortText} characters. Shorten it and try again; your input has been preserved.`;
}

export type FormFeedbackState = { error: string };

export class ConceptAliasConflictError extends Error {
  readonly conceptTitle: string;
  constructor(conceptTitle: string) {
    super(`An alias conflicts with the concept "${conceptTitle}".`);
    this.conceptTitle = conceptTitle;
    this.name = "ConceptAliasConflictError";
  }
}

export function conceptAliasConflictMessage(error: ConceptAliasConflictError, locale: "fr" | "en") {
  return locale === "fr"
    ? `Un alias est déjà réservé au concept « ${error.conceptTitle} » (son titre, un alias ou une ancienne adresse). Retirez ou modifiez cet alias, puis réessayez. Votre saisie est conservée.`
    : `An alias is already reserved for the concept “${error.conceptTitle}” (its title, an alias or a previous address). Remove or change that alias, then try again. Your input has been kept.`;
}

export class ContentValidationError extends Error {
  readonly reason: "empty-solution" | "long-solution" | "concept-not-usable";
  constructor(reason: ContentValidationError["reason"]) {
    super(reason);
    this.reason = reason;
    this.name = "ContentValidationError";
  }
}

export function conceptStatusAllowsReview(status: string) {
  return status === "USABLE" || status === "REVIEWED" || status === "EXCELLENT";
}
