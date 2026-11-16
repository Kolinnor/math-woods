import { findDomainOption, parentProblemDomainForCode } from "./domains.ts";
import { parseProblemDifficulty } from "./problems.ts";

export type ProblemCreateMissingField = "difficulty" | "domain";

export class ProblemClassificationError extends Error {
  readonly missingFields: ProblemCreateMissingField[];
  constructor(missingFields: ProblemCreateMissingField[]) {
    super("Missing or invalid difficulty or domain.");
    this.name = "ProblemClassificationError";
    this.missingFields = missingFields;
  }
}

/** Validate explicit choices before creation; never silently turn unknown codes into Other. */
export function assertProblemClassification(form: FormData) {
  const missing: ProblemCreateMissingField[] = [];
  if (parseProblemDifficulty(form.get("difficulty")) === null) missing.push("difficulty");
  const values = form.getAll("domains");
  if (!values.length || values.some(value => typeof value !== "string" ||
      !findDomainOption(value) || !parentProblemDomainForCode(value))) missing.push("domain");
  if (missing.length) throw new ProblemClassificationError(missing);
}
