import { Role } from "@prisma/client";

export const DAILY_PROBLEM_REPUTATION_POINTS = 50;
export const LEARNING_SOLVE_REPUTATION_POINTS = 1;
export const LEARNING_SOLVE_DAILY_LIMIT = 5;
export const LEARNING_SOLVE_LIFETIME_LIMIT = 50;
export const PAGE_TRANSLATION_REPUTATION_POINTS = 2;
export const COMPANION_TRANSLATION_REPUTATION_POINTS = 1;
export const TRANSLATION_REPUTATION_DAILY_LIMIT = 10;
export const AUTHORED_CONCEPT_REPUTATION_POINTS = 2;
export const AUTHORED_PROBLEM_BASE_REPUTATION_POINTS = 4;
export const PROBLEM_FAVORITE_REPUTATION_POINTS = 2;
export const TRUSTED_PROBLEM_FAVORITE_BONUS = 1;
export const PROBLEM_SOLVE_REPUTATION_POINTS = 1;
export const PROBLEM_SOLVE_REPUTATION_LIMIT = 10;
export const ILLUSTRATED_CONTENT_REPUTATION_POINTS = 2;
export const USEFUL_SOLUTION_VOTE_THRESHOLD = 3;
export const USEFUL_SOLUTION_BASE_REPUTATION_POINTS = 8;
export const USEFUL_SOLUTION_EXTRA_VOTE_POINTS = 2;
export const USEFUL_SOLUTION_REPUTATION_LIMIT = 30;
export const REVIEWED_CONTRIBUTION_REPUTATION_POINTS = 1;
export const REVIEWED_CONTRIBUTION_REPUTATION_LIMIT = 100;
export const CURATION_ITEMS_PER_REPUTATION_POINT = 5;
export const CURATION_REPUTATION_LIMIT = 20;

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

export function authoredConceptReputationBonus(conceptCount: number) {
  return Math.max(0, Math.floor(conceptCount)) * AUTHORED_CONCEPT_REPUTATION_POINTS;
}

export function problemAuthorshipReputationBonus(input: {
  favoriteCount: number;
  trustedFavoriteCount: number;
  solveCount: number;
  hasIllustration: boolean;
}) {
  const favoriteCount = Math.max(0, Math.floor(input.favoriteCount));
  if (favoriteCount === 0) return 0;

  return AUTHORED_PROBLEM_BASE_REPUTATION_POINTS
    + favoriteCount * PROBLEM_FAVORITE_REPUTATION_POINTS
    + Math.min(favoriteCount, Math.max(0, Math.floor(input.trustedFavoriteCount))) * TRUSTED_PROBLEM_FAVORITE_BONUS
    + Math.min(PROBLEM_SOLVE_REPUTATION_LIMIT, Math.max(0, Math.floor(input.solveCount))) * PROBLEM_SOLVE_REPUTATION_POINTS
    + (input.hasIllustration ? ILLUSTRATED_CONTENT_REPUTATION_POINTS : 0);
}

export function solutionAuthorshipReputationBonus(input: {
  usefulVoteCount: number;
  hasIllustration: boolean;
}) {
  const usefulVoteCount = Math.max(0, Math.floor(input.usefulVoteCount));
  if (usefulVoteCount < USEFUL_SOLUTION_VOTE_THRESHOLD) return 0;

  return Math.min(
    USEFUL_SOLUTION_REPUTATION_LIMIT,
    USEFUL_SOLUTION_BASE_REPUTATION_POINTS
      + (usefulVoteCount - USEFUL_SOLUTION_VOTE_THRESHOLD) * USEFUL_SOLUTION_EXTRA_VOTE_POINTS
      + (input.hasIllustration ? ILLUSTRATED_CONTENT_REPUTATION_POINTS : 0)
  );
}

export function reviewedContributionReputationBonus(reviewedPageCount: number) {
  return Math.min(
    REVIEWED_CONTRIBUTION_REPUTATION_LIMIT,
    Math.max(0, Math.floor(reviewedPageCount)) * REVIEWED_CONTRIBUTION_REPUTATION_POINTS
  );
}

export function curationActivityReputationBonus(curatedItemCount: number) {
  return Math.min(
    CURATION_REPUTATION_LIMIT,
    Math.floor(Math.max(0, Math.floor(curatedItemCount)) / CURATION_ITEMS_PER_REPUTATION_POINT)
  );
}

export function contentHasIllustration(markdown: string) {
  return /!\[[^\]]*\]\([^\n)]+\)|<img\b|```\s*jsxgraph\b/i.test(markdown);
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
