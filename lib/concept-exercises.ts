export const MAX_CONCEPT_EXERCISES = 24;
export type ConceptExerciseCountMode = "at-least" | "at-most";

export function parseConceptExerciseCountMode(value: unknown): ConceptExerciseCountMode {
  return value === "at-most" ? "at-most" : "at-least";
}

export function parseConceptExerciseCount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return Math.min(parsed, MAX_CONCEPT_EXERCISES);
}

export function parseMinimumConceptExercises(value: unknown) {
  const parsed = parseConceptExerciseCount(value);
  return parsed && parsed > 0 ? parsed : 0;
}

export function parseConceptExerciseIds(values: readonly FormDataEntryValue[]) {
  const seen = new Set<number>();
  const exerciseIds: number[] = [];

  for (const value of values) {
    const exerciseId = Number(value);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0 || seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    exerciseIds.push(exerciseId);
    if (exerciseIds.length >= MAX_CONCEPT_EXERCISES) break;
  }

  return exerciseIds;
}
