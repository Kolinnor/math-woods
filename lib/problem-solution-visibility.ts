type ProblemSolutionVisibilityInput = {
  requiresVerification: boolean;
  hasSolvedAttempt: boolean;
  canEditProblem: boolean;
};

export function canViewProblemSolutions({
  requiresVerification,
  hasSolvedAttempt,
  canEditProblem
}: ProblemSolutionVisibilityInput) {
  return !requiresVerification || hasSolvedAttempt || canEditProblem;
}
