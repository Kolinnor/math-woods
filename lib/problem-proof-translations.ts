type ProofTranslationCandidate = {
  id: number;
  translationGroupId: string;
  problemId: number;
  language: string;
};

type ProblemTranslationCandidate = {
  id: number;
  slug: string;
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

export function missingProblemProofTranslationTarget<
  TProof extends ProofTranslationCandidate,
  TProblem extends ProblemTranslationCandidate
>(
  proof: TProof,
  proofFamily: readonly TProof[],
  problemFamily: readonly TProblem[],
  preferredProblemId: number
) {
  const occupiedProblemIds = new Set(
    proofFamily
      .filter((candidate) => candidate.translationGroupId === proof.translationGroupId)
      .map((candidate) => candidate.problemId)
  );
  const candidates = problemFamily.filter(
    (candidate) => candidate.language !== proof.language && !occupiedProblemIds.has(candidate.id)
  );
  return candidates.find((candidate) => candidate.id === preferredProblemId) ?? candidates[0] ?? null;
}
