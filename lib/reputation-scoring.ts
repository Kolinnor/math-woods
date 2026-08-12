import { Role } from "@prisma/client";

export const DAILY_PROBLEM_REPUTATION_POINTS = 50;

export function dailyProblemReputationBonus(dailyProblemCount: number, role: Role) {
  if (role === Role.ADMIN || role === Role.OWNER) return 0;
  return Math.max(0, dailyProblemCount) * DAILY_PROBLEM_REPUTATION_POINTS;
}
