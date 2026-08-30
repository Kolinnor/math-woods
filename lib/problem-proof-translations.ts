type ProofTranslationCandidate = {
  id: number;
  translationGroupId: string;
  problemId: number;
  language: string;
};

export function selectProblemProofsForPage<T extends ProofTranslationCandidate>(
  proofs: T[],
  problemId: number,
  language: string
) {
  const selectedByGroup = new Map<string, T>();
  for (const proof of proofs) {
    const selected = selectedByGroup.get(proof.translationGroupId);
    if (
      !selected
      || (proof.problemId === problemId && selected.problemId !== problemId)
      || (proof.language === language && selected.language !== language && selected.problemId !== problemId)
    ) {
      selectedByGroup.set(proof.translationGroupId, proof);
    }
  }
  return [...selectedByGroup.values()];
}
