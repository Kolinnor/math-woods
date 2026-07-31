export type ProblemHintCandidate = {
  id: number;
  translationGroupId: string;
  problemId: number;
  proofId: number | null;
  position: number;
  bodyMarkdown: string;
  bodyHtml: string;
  language: string;
  translatedFromProblemId: number | null;
};

export type SelectedProblemHint = ProblemHintCandidate & {
  isLanguageFallback: boolean;
};

function orderedHints<T extends ProblemHintCandidate>(hints: T[]) {
  return [...hints].sort((left, right) => left.position - right.position || left.id - right.id);
}

function preferredFallbackProblemId(hints: ProblemHintCandidate[], currentProblemId: number) {
  const alternatives = hints.filter((hint) => hint.problemId !== currentProblemId);
  if (!alternatives.length) return null;

  const counts = new Map<number, number>();
  for (const hint of alternatives) {
    counts.set(hint.problemId, (counts.get(hint.problemId) ?? 0) + 1);
  }

  const candidateProblemIds = [...counts.keys()];
  return candidateProblemIds.sort((leftId, rightId) => {
    const leftHints = alternatives.filter((hint) => hint.problemId === leftId);
    const rightHints = alternatives.filter((hint) => hint.problemId === rightId);
    const leftIsOriginal = leftHints.some((hint) => hint.translatedFromProblemId === null);
    const rightIsOriginal = rightHints.some((hint) => hint.translatedFromProblemId === null);
    if (leftIsOriginal !== rightIsOriginal) return leftIsOriginal ? -1 : 1;

    const leftIsEnglish = leftHints.some((hint) => hint.language === "en");
    const rightIsEnglish = rightHints.some((hint) => hint.language === "en");
    if (leftIsEnglish !== rightIsEnglish) return leftIsEnglish ? -1 : 1;

    return (counts.get(rightId) ?? 0) - (counts.get(leftId) ?? 0) || leftId - rightId;
  })[0] ?? null;
}

export function selectProblemHintsForLanguage(
  candidates: ProblemHintCandidate[],
  currentProblemId: number
): SelectedProblemHint[] {
  const fallbackProblemId = preferredFallbackProblemId(candidates, currentProblemId);
  const groups = new Map<string, ProblemHintCandidate[]>();
  for (const hint of candidates) {
    groups.set(hint.translationGroupId, [
      ...(groups.get(hint.translationGroupId) ?? []),
      hint
    ]);
  }

  const selected = [...groups.values()].flatMap((translations) => {
    const local = translations.find((hint) => hint.problemId === currentProblemId);
    if (local) return [{ ...local, isLanguageFallback: false }];
    const fallback = translations.find((hint) => hint.problemId === fallbackProblemId);
    return fallback ? [{ ...fallback, isLanguageFallback: true }] : [];
  });

  return orderedHints(selected);
}
