export const MAX_CONCEPT_EXERCISES = 24;

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
