type OwnerSolvedBannerInput = {
  hasAnyProof: boolean;
  hasOwnProof: boolean;
  hasRelatedProblems: boolean;
  isExercise: boolean;
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
