import { Role } from "@prisma/client";

export const DAILY_PROBLEM_REPUTATION_POINTS = 50;
export const LEARNING_SOLVE_REPUTATION_POINTS = 1;
export const LEARNING_SOLVE_DAILY_LIMIT = 5;
export const LEARNING_SOLVE_LIFETIME_LIMIT = 50;
export const PROBLEM_TRANSLATION_REPUTATION_POINTS = 4;
export const PAGE_TRANSLATION_REPUTATION_POINTS = 2;
export const COMPANION_TRANSLATION_REPUTATION_POINTS = 1;
export const AUTHORED_CONCEPT_BASE_REPUTATION_POINTS = 1;
export const REVIEWED_CONCEPT_REPUTATION_POINTS = 2;
export const AUTHORED_PROBLEM_BASE_REPUTATION_POINTS = 3;
export const PROBLEM_FAVORITE_REPUTATION_POINTS = 2;
export const ILLUSTRATED_CONCEPT_REPUTATION_POINTS = 1;
export const AUTHORED_SOLUTION_BASE_REPUTATION_POINTS = 2;
export const USEFUL_SOLUTION_FULL_VALUE_VOTE_LIMIT = 10;
export const USEFUL_SOLUTION_VOTE_POINTS = 2;
export const USEFUL_SOLUTION_LATE_VOTE_POINTS = 1;
export const REVIEWED_CONTRIBUTION_REPUTATION_POINTS = 1;
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

export type ReputationProblem = {
  authorId: number;
  translationGroupId: string;
  attempts: Array<{ userId: number }>;
  favorites: Array<{ userId: number }>;
};

export type ReputationProblemSource = ReputationProblem & {
  translatedFromProblemId: number | null;
};

export function mergeProblemAuthorshipGroups(problems: ReputationProblemSource[]) {
  const groups = new Map<string, ReputationProblem & { hasOriginal: boolean }>();
  for (const problem of problems) {
    const key = problem.translationGroupId;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        authorId: problem.authorId,
        translationGroupId: problem.translationGroupId,
        attempts: [...problem.attempts],
        favorites: [...problem.favorites],
        hasOriginal: problem.translatedFromProblemId === null
      });
      continue;
    }
    if (problem.translatedFromProblemId === null) {
      existing.authorId = problem.authorId;
      existing.hasOriginal = true;
    }
    const attemptUsers = new Set(existing.attempts.map((attempt) => attempt.userId));
    const favoriteUsers = new Set(existing.favorites.map((favorite) => favorite.userId));
    existing.attempts.push(...problem.attempts.filter((attempt) => !attemptUsers.has(attempt.userId)));
    existing.favorites.push(...problem.favorites.filter((favorite) => !favoriteUsers.has(favorite.userId)));
  }
  return [...groups.values()].flatMap(({ hasOriginal, ...problem }) => hasOriginal ? [problem] : []);
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function conceptAuthorshipReputationBonus(input: {
  reviewed: boolean;
  hasIllustration: boolean;
}) {
  return AUTHORED_CONCEPT_BASE_REPUTATION_POINTS
    + (input.reviewed ? REVIEWED_CONCEPT_REPUTATION_POINTS : 0)
    + (input.hasIllustration ? ILLUSTRATED_CONCEPT_REPUTATION_POINTS : 0);
}

export function problemAuthorshipReputationBonus(input: { favoriteCount: number }) {
  const favoriteCount = Math.max(0, Math.floor(input.favoriteCount));
  return AUTHORED_PROBLEM_BASE_REPUTATION_POINTS + favoriteCount * PROBLEM_FAVORITE_REPUTATION_POINTS;
}

export function solutionAuthorshipReputationBonus(input: { usefulVoteCount: number }) {
  const usefulVoteCount = Math.max(0, Math.floor(input.usefulVoteCount));
  return AUTHORED_SOLUTION_BASE_REPUTATION_POINTS
    + Math.min(usefulVoteCount, USEFUL_SOLUTION_FULL_VALUE_VOTE_LIMIT) * USEFUL_SOLUTION_VOTE_POINTS
    + Math.max(0, usefulVoteCount - USEFUL_SOLUTION_FULL_VALUE_VOTE_LIMIT) * USEFUL_SOLUTION_LATE_VOTE_POINTS;
}

export function reviewedContributionReputationBonus(reviewedPageCount: number) {
  return Math.max(0, Math.floor(reviewedPageCount)) * REVIEWED_CONTRIBUTION_REPUTATION_POINTS;
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

  return [...uniqueEvents.values()].reduce(
    (total, event) => total + Math.max(0, Math.floor(event.points)),
    0
  );
}
