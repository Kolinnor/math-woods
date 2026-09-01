type OwnerSolvedBannerInput = {
  hasAnyProof: boolean;
  hasOwnProof: boolean;
  hasRelatedProblems: boolean;
  isExercise: boolean;
};

type OwnerProblemBannerInput = OwnerSolvedBannerInput & {
  hasExternalSolvers: boolean;
  hasSolvedAttempt: boolean;
};

export function shouldShowOwnerSolvedBanner({
  hasAnyProof,
  hasOwnProof,
  hasRelatedProblems,
  isExercise
}: OwnerSolvedBannerInput) {
  if (!hasOwnProof) return !hasAnyProof;
  return isExercise || !hasRelatedProblems;
}

export function shouldShowOwnerProblemBanner({
  hasExternalSolvers,
  hasSolvedAttempt,
  ...improvementInput
}: OwnerProblemBannerInput) {
  return hasExternalSolvers || (hasSolvedAttempt && shouldShowOwnerSolvedBanner(improvementInput));
}
