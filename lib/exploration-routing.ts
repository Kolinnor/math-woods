export type ExplorationQuizOutcomeCandidate = {
  id: number;
  kind: "ANSWER" | "CORRECT" | "INCORRECT" | "COMBINATION";
  optionIds: number[];
  position: number;
  toPageId: number | null;
};

function normalizedOptionIds(optionIds: number[]) {
  return [...new Set(optionIds.filter(Number.isInteger))].sort((left, right) => left - right);
}

function exactSelectionMatches(expected: number[], selected: number[]) {
  return expected.length === selected.length && expected.every((optionId, index) => optionId === selected[index]);
}

export function resolveExplorationQuizOutcome(
  outcomes: ExplorationQuizOutcomeCandidate[],
  selectedOptionIds: number[],
  isCorrect: boolean | null
) {
  const selected = normalizedOptionIds(selectedOptionIds);
  const ordered = [...outcomes].sort((left, right) => left.position - right.position);
  const exactCombination = ordered.find((outcome) =>
    outcome.kind === "COMBINATION" && exactSelectionMatches(normalizedOptionIds(outcome.optionIds), selected)
  );
  if (exactCombination) return exactCombination;

  const answer = ordered.find((outcome) =>
    outcome.kind === "ANSWER" && exactSelectionMatches(normalizedOptionIds(outcome.optionIds), selected)
  );
  if (answer) return answer;

  if (isCorrect === true) return ordered.find((outcome) => outcome.kind === "CORRECT") ?? null;
  if (isCorrect === false) return ordered.find((outcome) => outcome.kind === "INCORRECT") ?? null;
  return null;
}
