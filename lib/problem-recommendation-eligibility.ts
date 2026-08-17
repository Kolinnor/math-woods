export const RECOMMENDATION_DIFFICULTY_CEILING = 90;

export const RECOMMENDABLE_PROBLEM_WHERE = {
  isConjecture: false,
  difficulty: { lt: RECOMMENDATION_DIFFICULTY_CEILING }
} as const;

export function isProblemRecommendationEligible(problem: {
  difficulty: number | null;
  isConjecture: boolean;
}) {
  return (
    !problem.isConjecture
    && problem.difficulty !== null
    && problem.difficulty < RECOMMENDATION_DIFFICULTY_CEILING
  );
}
