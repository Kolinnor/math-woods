export const MIN_PROBLEM_DIFFICULTY = 1;
export const MAX_PROBLEM_DIFFICULTY = 100;
export const COMMUNITY_ACCEPTED_PROOF_VOTES = 3;

export function parseProblemDifficulty(value: FormDataEntryValue | null) {
  const difficulty = Number(value);
  if (!Number.isInteger(difficulty) || difficulty < MIN_PROBLEM_DIFFICULTY || difficulty > MAX_PROBLEM_DIFFICULTY) {
    return null;
  }
  return difficulty;
}
