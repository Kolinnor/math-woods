import { ConceptStatus } from "@prisma/client";

export const DAILY_CONCEPT_REVIEW_STATUSES = [
  ConceptStatus.MISSING,
  ConceptStatus.STUB,
  ConceptStatus.USABLE
] as const;

export const DAILY_CONCEPT_REVIEW_STALE_POOL_SIZE = 12;

type StaleConceptCandidate = {
  updatedAt: Date;
};

export function dailyConceptReviewStatusRank(status: ConceptStatus) {
  return DAILY_CONCEPT_REVIEW_STATUSES.indexOf(status as (typeof DAILY_CONCEPT_REVIEW_STATUSES)[number]);
}

export function isDailyConceptReviewStatus(status: ConceptStatus) {
  return dailyConceptReviewStatusRank(status) >= 0;
}

export function pickStaleConceptCandidate<T extends StaleConceptCandidate>(
  candidates: readonly T[],
  random: () => number = Math.random
) {
  if (candidates.length === 0) return null;

  const pool = [...candidates]
    .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())
    .slice(0, DAILY_CONCEPT_REVIEW_STALE_POOL_SIZE);
  const randomIndex = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[randomIndex];
}
