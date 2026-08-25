import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
import { RECOMMENDABLE_PROBLEM_WHERE } from "@/lib/problem-recommendation-eligibility";
import { selectExactContentTranslation } from "@/lib/translation-routing";
import {
  buildRecommendationProfile,
  composeProblemRecommendations,
  excludedRecommendationGroupIds,
  recommendationDifficultyAdjustment,
  scoreProblemRecommendation,
  type RecommendationAttempt,
  type RecommendationAttemptStatus,
  type RecommendationFavorite,
  type RecommendationMathLevel
} from "@/lib/recommendations";
import { dailyProblemDateKey } from "@/lib/daily-problem-schedule";

const STATUS_PRIORITY: Record<RecommendationAttemptStatus, number> = {
  STARTED: 1,
  REVIEW_LATER: 2,
  BLOCKED: 3,
  SOLVED: 4
};

function problemDomains(problem: { domain: string; domains: Array<{ domain: string }> }) {
  return [...new Set([problem.domain, ...problem.domains.map((item) => item.domain)])];
}

function dedupeAttempts(
  attempts: Array<{
    status: RecommendationAttemptStatus;
    updatedAt: Date;
    problem: {
      translationGroupId: string;
      difficulty: number | null;
      domain: string;
      domains: Array<{ domain: string }>;
    };
  }>
) {
  const byGroup = new Map<string, RecommendationAttempt>();
  for (const attempt of attempts) {
    const candidate: RecommendationAttempt = {
      translationGroupId: attempt.problem.translationGroupId,
      difficulty: attempt.problem.difficulty,
      domains: problemDomains(attempt.problem),
      status: attempt.status,
      updatedAt: attempt.updatedAt
    };
    const existing = byGroup.get(candidate.translationGroupId);
    if (
      !existing ||
      STATUS_PRIORITY[candidate.status] > STATUS_PRIORITY[existing.status] ||
      (STATUS_PRIORITY[candidate.status] === STATUS_PRIORITY[existing.status] && candidate.updatedAt > existing.updatedAt)
    ) {
      byGroup.set(candidate.translationGroupId, candidate);
    }
  }
  return [...byGroup.values()];
}

function dedupeFavorites(
  favorites: Array<{
    createdAt: Date;
    problem: { translationGroupId: string; domain: string; domains: Array<{ domain: string }> };
  }>
) {
  const byGroup = new Map<string, RecommendationFavorite>();
  for (const favorite of favorites) {
    const candidate: RecommendationFavorite = {
      translationGroupId: favorite.problem.translationGroupId,
      domains: problemDomains(favorite.problem),
      createdAt: favorite.createdAt
    };
    const existing = byGroup.get(candidate.translationGroupId);
    if (!existing || candidate.createdAt > existing.createdAt) byGroup.set(candidate.translationGroupId, candidate);
  }
  return [...byGroup.values()];
}

export async function recommendationsForUser(userId: number, requestedLimit = 20, preferredLanguage = "en") {
  const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit) || 20));
  const recommendationLanguage = parseContentLanguage(preferredLanguage);
  const now = new Date();
  const eventCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      mathLevel: true,
      mathematicalDomains: true,
      problems: {
        select: { translationGroupId: true }
      },
      attempts: {
        select: {
          status: true,
          updatedAt: true,
          problem: {
            select: {
              translationGroupId: true,
              difficulty: true,
              domain: true,
              domains: { select: { domain: true } }
            }
          }
        }
      },
      favorites: {
        select: {
          createdAt: true,
          problem: {
            select: {
              translationGroupId: true,
              domain: true,
              domains: { select: { domain: true } }
            }
          }
        }
      },
      problemReactions: {
        select: {
          difficultyReaction: true,
          preferenceReaction: true,
          updatedAt: true,
          problem: {
            select: {
              difficulty: true,
              domain: true,
              domains: { select: { domain: true } }
            }
          }
        }
      },
      recommendationExposures: {
        select: {
          translationGroupId: true,
          exposureCount: true,
          lastOpenedAt: true
        }
      },
      recommendationEvents: {
        where: { createdAt: { gte: eventCutoff } },
        select: { eventType: true, dateKey: true }
      }
    }
  });
  if (!user) return null;

  const attempts = dedupeAttempts(user.attempts);
  const favorites = dedupeFavorites(user.favorites);
  const attemptByGroup = new Map(attempts.map((attempt) => [attempt.translationGroupId, attempt]));
  const favoriteGroups = new Set(favorites.map((favorite) => favorite.translationGroupId));
  const exposureByGroup = new Map(
    user.recommendationExposures.map((exposure) => [exposure.translationGroupId, exposure])
  );
  const solvedGroups = attempts.filter((attempt) => attempt.status === "SOLVED").map((attempt) => attempt.translationGroupId);
  const excludedGroups = excludedRecommendationGroupIds(
    solvedGroups,
    user.problems.map((problem) => problem.translationGroupId)
  );
  const profile = buildRecommendationProfile(
    {
      mathLevel: user.mathLevel as RecommendationMathLevel | null,
      mathematicalDomains: user.mathematicalDomains,
      attempts,
      favorites,
      reactions: user.problemReactions.map((reaction) => ({
        difficulty: reaction.problem.difficulty,
        domains: problemDomains(reaction.problem),
        difficultyReaction: reaction.difficultyReaction,
        preferenceReaction: reaction.preferenceReaction,
        updatedAt: reaction.updatedAt
      }))
    },
    now
  );
  const adaptation = recommendationDifficultyAdjustment(
    profile.targetDifficulty,
    user.recommendationEvents,
    dailyProblemDateKey(now)
  );
  const adaptedProfile = {
    ...profile,
    targetDifficulty: adaptation.adjustedTargetDifficulty
  };

  const problems = await prisma.problem.findMany({
    where: {
      status: "PUBLISHED",
      listed: true,
      language: recommendationLanguage,
      authorId: { not: user.id },
      translationGroupId: { notIn: excludedGroups },
      ...RECOMMENDABLE_PROBLEM_WHERE
    },
    select: {
      id: true,
      slug: true,
      title: true,
      bodyHtml: true,
      language: true,
      translationGroupId: true,
      translatedFromProblemId: true,
      difficulty: true,
      isConjecture: true,
      domain: true,
      domains: { select: { domain: true } },
      qualityStatus: true,
      isExercise: true,
      createdAt: true,
      author: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          avatarBackground: true
        }
      }
    }
  });

  const candidatesByGroup = new Map<string, typeof problems>();
  for (const problem of problems) {
    candidatesByGroup.set(problem.translationGroupId, [
      ...(candidatesByGroup.get(problem.translationGroupId) ?? []),
      problem
    ]);
  }

  const scoredCandidates = [...candidatesByGroup.values()]
    .map((translations) => {
      const problem = selectExactContentTranslation(
        translations.map((item) => ({
          ...item,
          isSource: item.translatedFromProblemId === null
        })),
        recommendationLanguage
      );
      if (!problem) return null;
      const attempt = attemptByGroup.get(problem.translationGroupId);
      const exposure = exposureByGroup.get(problem.translationGroupId);
      const score = scoreProblemRecommendation(
        adaptedProfile,
        {
          id: problem.id,
          translationGroupId: problem.translationGroupId,
          difficulty: problem.difficulty,
          isConjecture: problem.isConjecture,
          domains: problemDomains(problem),
          qualityStatus: problem.qualityStatus,
          isExercise: problem.isExercise,
          createdAt: problem.createdAt,
          attemptStatus: attempt?.status,
          attemptUpdatedAt: attempt?.updatedAt,
          favorite: favoriteGroups.has(problem.translationGroupId),
          exposureCount: exposure?.exposureCount,
          lastOpenedAt: exposure?.lastOpenedAt
        },
        { mathLevel: user.mathLevel as RecommendationMathLevel | null, now }
      );
      return score ? {
        problem: { ...problem, domains: problemDomains(problem) },
        attemptStatus: attempt?.status,
        ...score
      } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const recommendations = composeProblemRecommendations(
    scoredCandidates,
    limit,
    adaptation.adjustedTargetDifficulty,
    profile.domains
  ).map(({ problem, attemptStatus: _attemptStatus, ...score }) => ({
      problem: {
        id: problem.id,
        slug: problem.slug,
        title: problem.title,
        bodyHtml: problem.bodyHtml,
        language: problem.language,
        translationGroupId: problem.translationGroupId,
        difficulty: problem.difficulty,
        domains: problem.domains,
        qualityStatus: problem.qualityStatus,
        isExercise: problem.isExercise,
        author: problem.author
      },
      ...score
    }));

  return {
    generatedAt: now.toISOString(),
    user: { id: user.id, username: user.username, displayName: user.displayName },
    profile,
    adaptation,
    recommendations
  };
}

export async function recommendationShadowForUser(userId: number, requestedLimit = 20) {
  return recommendationsForUser(userId, requestedLimit);
}
