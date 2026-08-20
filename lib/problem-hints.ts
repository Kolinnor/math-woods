export type ProblemHintCandidate<TTranslator = unknown> = {
  id: number;
  translationGroupId: string;
  translatedFromHintId?: number | null;
  problemId: number;
  proofId: number | null;
  position: number;
  bodyMarkdown: string;
  bodyHtml: string;
  language: string;
  translatedFromProblemId: number | null;
  translatedBy?: TTranslator;
};

export type SelectedProblemHint<TTranslator = unknown> = ProblemHintCandidate<TTranslator> & {
  isLanguageFallback: boolean;
};

function orderedHints<T extends ProblemHintCandidate<unknown>>(hints: T[]) {
  return [...hints].sort((left, right) => left.position - right.position || left.id - right.id);
}

type ProblemHintOrderCandidate = Pick<
  ProblemHintCandidate,
  "id" | "position" | "translatedFromHintId" | "translationGroupId"
>;

function canonicalHintsByGroup(candidates: ProblemHintOrderCandidate[]) {
  const canonicalByGroup = new Map<string, ProblemHintOrderCandidate>();
  for (const candidate of candidates) {
    const current = canonicalByGroup.get(candidate.translationGroupId);
    const candidateIsSource = candidate.translatedFromHintId == null;
    const currentIsSource = current?.translatedFromHintId == null;
    if (
      !current ||
      (candidateIsSource && !currentIsSource) ||
      (candidateIsSource === currentIsSource && candidate.id < current.id)
    ) {
      canonicalByGroup.set(candidate.translationGroupId, candidate);
    }
  }
  return canonicalByGroup;
}

export function canonicalProblemHintPositions(candidates: ProblemHintOrderCandidate[]) {
  return new Map(
    [...canonicalHintsByGroup(candidates)].map(([translationGroupId, hint]) => [
      translationGroupId,
      hint.position
    ])
  );
}

export function orderProblemHintsByCanonicalOrder<T extends ProblemHintOrderCandidate>(
  hints: T[],
  familyCandidates: ProblemHintOrderCandidate[] = hints
) {
  const canonicalByGroup = canonicalHintsByGroup(familyCandidates);
  return [...hints].sort((left, right) => {
    const leftCanonical = canonicalByGroup.get(left.translationGroupId) ?? left;
    const rightCanonical = canonicalByGroup.get(right.translationGroupId) ?? right;
    return (
      leftCanonical.position - rightCanonical.position ||
      leftCanonical.id - rightCanonical.id ||
      left.translationGroupId.localeCompare(right.translationGroupId) ||
      left.id - right.id
    );
  });
}

function preferredFallbackProblemId(hints: ProblemHintCandidate<unknown>[], currentProblemId: number) {
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
    const leftIsEnglish = leftHints.some((hint) => hint.language === "en");
    const rightIsEnglish = rightHints.some((hint) => hint.language === "en");
    if (leftIsEnglish !== rightIsEnglish) return leftIsEnglish ? -1 : 1;

    const leftIsOriginal = leftHints.some((hint) => hint.translatedFromProblemId === null);
    const rightIsOriginal = rightHints.some((hint) => hint.translatedFromProblemId === null);
    if (leftIsOriginal !== rightIsOriginal) return leftIsOriginal ? -1 : 1;

    return (counts.get(rightId) ?? 0) - (counts.get(leftId) ?? 0) || leftId - rightId;
  })[0] ?? null;
}

export function selectProblemHintsForLanguage<TTranslator = unknown>(
  candidates: ProblemHintCandidate<TTranslator>[],
  currentProblemId: number
): SelectedProblemHint<TTranslator>[] {
  const fallbackProblemId = preferredFallbackProblemId(candidates, currentProblemId);
  const groups = new Map<string, ProblemHintCandidate<TTranslator>[]>();
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

  return orderProblemHintsByCanonicalOrder(selected, candidates);
}
