export type FormFeedbackState = { error: string };

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
