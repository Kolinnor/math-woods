import { selectContentTranslation } from "./translation-routing.ts";

type TipProblemLink = {
  translationGroupId: string;
};

type TipProblemCandidate = {
  id: number;
  language: string;
  translationGroupId: string;
  translatedFromProblemId?: number | null;
  createdAt?: Date | string;
};

export function selectTipProblemTranslations<T extends TipProblemCandidate>(
  links: readonly TipProblemLink[],
  candidates: readonly T[],
  preferredLanguage: string
) {
  const candidatesByGroup = new Map<string, T[]>();
  for (const problem of candidates) {
    candidatesByGroup.set(problem.translationGroupId, [
      ...(candidatesByGroup.get(problem.translationGroupId) ?? []),
      problem
    ]);
  }

  return links.flatMap((link) => {
    const selected = selectContentTranslation(
      (candidatesByGroup.get(link.translationGroupId) ?? []).map((problem) => ({
        ...problem,
        isSource: problem.translatedFromProblemId === null
      })),
      preferredLanguage
    );
    return selected ? [selected] : [];
  });
}
