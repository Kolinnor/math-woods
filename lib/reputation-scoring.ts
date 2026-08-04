export const DAILY_PROBLEM_REPUTATION_POINTS = 50;

export function dailyProblemReputationBonus(dailyProblemCount: number) {
  return Math.max(0, dailyProblemCount) * DAILY_PROBLEM_REPUTATION_POINTS;
}
