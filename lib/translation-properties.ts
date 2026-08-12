import type { ConceptRevisionSnapshot } from "./concept-revisions.ts";
import type { ProblemRevisionSnapshot, ProblemSnapshotField } from "./problem-revisions.ts";

export const PROBLEM_TRANSLATION_SHARED_FIELDS = [
  "difficulty",
  "domains",
  "origin",
  "originChapter",
  "originPage",
  "listed",
  "isExercise",
  "showRelatedProblems",
  "canAppearOnFrontPage",
  "tags",
  "spoilerTags"
] as const satisfies readonly ProblemSnapshotField[];

export type ProblemTranslationSharedField = (typeof PROBLEM_TRANSLATION_SHARED_FIELDS)[number];

const PROBLEM_TRANSLATION_SHARED_FIELD_SET = new Set<ProblemSnapshotField>(PROBLEM_TRANSLATION_SHARED_FIELDS);

export function problemTranslationSharedChanges(fields: readonly ProblemSnapshotField[]) {
  return fields.filter((field): field is ProblemTranslationSharedField =>
    PROBLEM_TRANSLATION_SHARED_FIELD_SET.has(field)
  );
}

export const CONCEPT_TRANSLATION_SHARED_FIELDS = [
  "domainCode",
  "kind",
  "canAppearInConceptBrowser",
  "practiceExercises"
] as const satisfies readonly (keyof ConceptRevisionSnapshot)[];

export type ConceptTranslationSharedField = (typeof CONCEPT_TRANSLATION_SHARED_FIELDS)[number];

const CONCEPT_TRANSLATION_SHARED_FIELD_SET = new Set<keyof ConceptRevisionSnapshot>(
  CONCEPT_TRANSLATION_SHARED_FIELDS
);

export function conceptTranslationSharedChanges(fields: readonly (keyof ConceptRevisionSnapshot)[]) {
  return fields.filter((field): field is ConceptTranslationSharedField =>
    CONCEPT_TRANSLATION_SHARED_FIELD_SET.has(field)
  );
}
