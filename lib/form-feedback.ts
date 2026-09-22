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
