import { Role } from "@prisma/client";

export const DAILY_PROBLEM_REPUTATION_POINTS = 50;
export const LEARNING_SOLVE_REPUTATION_POINTS = 1;
export const LEARNING_SOLVE_DAILY_LIMIT = 5;
export const LEARNING_SOLVE_LIFETIME_LIMIT = 50;
export const PAGE_TRANSLATION_REPUTATION_POINTS = 2;
export const COMPANION_TRANSLATION_REPUTATION_POINTS = 1;
export const TRANSLATION_REPUTATION_DAILY_LIMIT = 10;

type LearningSolveEvent = {
  translationGroupId: string;
  solvedAt: Date;
};

type TranslationReputationEvent = {
  key: string;
  createdAt: Date;
  points: number;
};

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dailyProblemReputationBonus(dailyProblemCount: number, role: Role) {
  if (role === Role.ADMIN || role === Role.OWNER) return 0;
  return Math.max(0, dailyProblemCount) * DAILY_PROBLEM_REPUTATION_POINTS;
}

export function learningSolveReputationBonus(events: LearningSolveEvent[]) {
  const earliestByTranslationGroup = new Map<string, Date>();
  for (const event of events) {
    const current = earliestByTranslationGroup.get(event.translationGroupId);
    if (!current || event.solvedAt < current) {
      earliestByTranslationGroup.set(event.translationGroupId, event.solvedAt);
    }
  }

  const dailyCounts = new Map<string, number>();
  let rewardedSolves = 0;
  for (const solvedAt of [...earliestByTranslationGroup.values()].sort((left, right) => left.getTime() - right.getTime())) {
    if (rewardedSolves >= LEARNING_SOLVE_LIFETIME_LIMIT) break;
    const dateKey = utcDateKey(solvedAt);
    const dailyCount = dailyCounts.get(dateKey) ?? 0;
    if (dailyCount >= LEARNING_SOLVE_DAILY_LIMIT) continue;
    dailyCounts.set(dateKey, dailyCount + 1);
    rewardedSolves += 1;
  }

  return rewardedSolves * LEARNING_SOLVE_REPUTATION_POINTS;
}

export function translationReputationBonus(events: TranslationReputationEvent[]) {
  const uniqueEvents = new Map<string, TranslationReputationEvent>();
  for (const event of events) {
    const current = uniqueEvents.get(event.key);
    if (!current || event.createdAt < current.createdAt) uniqueEvents.set(event.key, event);
  }

  const dailyPoints = new Map<string, number>();
  let total = 0;
  for (const event of [...uniqueEvents.values()].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    const points = Math.max(0, Math.floor(event.points));
    const dateKey = utcDateKey(event.createdAt);
    const pointsForDay = dailyPoints.get(dateKey) ?? 0;
    if (pointsForDay + points > TRANSLATION_REPUTATION_DAILY_LIMIT) continue;
    dailyPoints.set(dateKey, pointsForDay + points);
    total += points;
  }

  return total;
}
