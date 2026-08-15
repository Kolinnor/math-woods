type ProblemSolutionVisibilityInput = {
  isAuthenticated: boolean;
  requiresVerification: boolean;
  hasSolvedAttempt: boolean;
  canEditProblem: boolean;
};

export function canViewProblemSolutions({
  isAuthenticated,
  requiresVerification,
  hasSolvedAttempt,
  canEditProblem
}: ProblemSolutionVisibilityInput) {
  return !isAuthenticated || !requiresVerification || hasSolvedAttempt || canEditProblem;
}
