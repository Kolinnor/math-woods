export type ExplorationQuizOption = {
  id: number;
  isCorrect: boolean | null;
};

export type ExplorationQuizEvaluation = {
  failedOptionIds: number[];
  isCorrect: boolean;
};

export function evaluateExplorationQuizSelection(
  options: ExplorationQuizOption[],
  selectedOptionIds: number[]
): ExplorationQuizEvaluation {
  const selectedIds = new Set(selectedOptionIds);
  const failedOptionIds = options.flatMap((option) => {
    const shouldBeSelected = option.isCorrect === true;
    return selectedIds.has(option.id) === shouldBeSelected ? [] : [option.id];
  });
  return { failedOptionIds, isCorrect: failedOptionIds.length === 0 };
}
