import { RecommendationEventType, type Prisma } from "@prisma/client";
import { dailyProblemDateKey } from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";

const RECOMMENDATION_OUTCOME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type RecommendationEventClient = Pick<Prisma.TransactionClient, "recommendationEvent">;

export type RecommendationProblemReference = {
  id: number;
  translationGroupId: string;
};

function eventScopeKey(translationGroupId: string) {
  return `problem:${translationGroupId}`;
}

export async function recordRecommendationEvent(
  input: {
    userId: number;
    eventType: RecommendationEventType;
    problem: RecommendationProblemReference;
    now?: Date;
  },
  client: RecommendationEventClient = prisma
) {
  const now = input.now ?? new Date();
  const translationGroupId = input.problem.translationGroupId;
  const dateKey = dailyProblemDateKey(now);
  const scopeKey = eventScopeKey(translationGroupId);

  await client.recommendationEvent.upsert({
    where: {
      userId_dateKey_scopeKey_eventType: {
        userId: input.userId,
        dateKey,
        scopeKey,
        eventType: input.eventType
      }
    },
    create: {
      userId: input.userId,
      problemId: input.problem.id,
      translationGroupId,
      scopeKey,
      eventType: input.eventType,
      dateKey,
      createdAt: now
    },
    update: { problemId: input.problem.id }
  });
}

export async function recordRecommendationOutcomeIfRelevant(
  input: {
    userId: number;
    eventType: Exclude<RecommendationEventType, "OPENED">;
    problem: RecommendationProblemReference;
    now?: Date;
  },
  client: RecommendationEventClient = prisma
) {
  const now = input.now ?? new Date();
  const qualifyingOpen = await client.recommendationEvent.findFirst({
    where: {
      userId: input.userId,
      translationGroupId: input.problem.translationGroupId,
      eventType: RecommendationEventType.OPENED,
      createdAt: { gte: new Date(now.getTime() - RECOMMENDATION_OUTCOME_WINDOW_MS) }
    },
    select: { id: true }
  });
  if (!qualifyingOpen) return false;

  await recordRecommendationEvent({ ...input, now }, client);
  return true;
}
