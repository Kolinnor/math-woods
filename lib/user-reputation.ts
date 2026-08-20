import { AttemptStatus, MathDomain, ProblemStatus, Role, SourceType, UserMathLevel } from "@prisma/client";
import { dailyProblemDateKey } from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { hasTrustedPrivileges } from "@/lib/permissions";
import {
  authoredContentReputationBonus,
  COMPANION_TRANSLATION_REPUTATION_POINTS,
  dailyProblemReputationBonus,
  learningSolveReputationBonus,
  PAGE_TRANSLATION_REPUTATION_POINTS,
  translationReputationBonus
} from "@/lib/reputation-scoring";
import { displayNameForUser } from "@/lib/user-display";

type ReputationProblem = {
  authorId: number;
  translationGroupId: string;
  attempts: Array<{
    userId: number;
    user: { role: Role };
  }>;
  favorites: Array<{
    userId: number;
    user: { role: Role };
  }>;
};

function mergeTranslatedProblems(problems: ReputationProblem[]) {
  const groups = new Map<string, ReputationProblem>();
  for (const problem of problems) {
    const key = `${problem.authorId}:${problem.translationGroupId}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...problem,
        attempts: [...problem.attempts],
        favorites: [...problem.favorites]
      });
      continue;
    }
    const attemptUsers = new Set(existing.attempts.map((attempt) => attempt.userId));
    const favoriteUsers = new Set(existing.favorites.map((favorite) => favorite.userId));
    existing.attempts.push(...problem.attempts.filter((attempt) => !attemptUsers.has(attempt.userId)));
    existing.favorites.push(...problem.favorites.filter((favorite) => !favoriteUsers.has(favorite.userId)));
  }
  return [...groups.values()];
}

export type UserReputationSummary = {
  userId: number;
  username: string;
  profileSlug: string;
  displayName: string | null;
  avatarBackground: string | null;
  avatarUrl: string | null;
  role: Role;
  mathLevel: UserMathLevel | null;
  bio: string | null;
  affiliation: string | null;
  websiteUrl: string | null;
  mathematicalDomains: MathDomain[];
  openToCollaboration: boolean;
  joinedAt: Date;
  reputation: number;
  problemCount: number;
  solvedCount: number;
  favoriteCount: number;
  engagementCount: number;
  conceptCount: number;
  solutionCount: number;
  explorationCount: number;
  dailyProblemCount: number;
  contestWinCount?: number;
};

function interactionWeight(role: Role, regularWeight: number, trustedWeight: number) {
  return hasTrustedPrivileges(role) ? trustedWeight : regularWeight;
}

function scoreProblem(problem: ReputationProblem) {
  const solveScore = problem.attempts
    .filter((attempt) => attempt.userId !== problem.authorId)
    .reduce((total, attempt) => total + interactionWeight(attempt.user.role, 1, 2), 0);

  const favoriteScore = problem.favorites
    .filter((favorite) => favorite.userId !== problem.authorId)
    .reduce((total, favorite) => total + interactionWeight(favorite.user.role, 5, 10), 0);

  return 1 + solveScore + favoriteScore;
}

function engagementCount(problem: ReputationProblem) {
  const externalSolves = problem.attempts.filter((attempt) => attempt.userId !== problem.authorId).length;
  const externalFavorites = problem.favorites.filter((favorite) => favorite.userId !== problem.authorId).length;
  return externalSolves + externalFavorites;
}

function solvedCount(problem: ReputationProblem) {
  return problem.attempts.filter((attempt) => attempt.userId !== problem.authorId).length;
}

function favoriteCount(problem: ReputationProblem) {
  return problem.favorites.filter((favorite) => favorite.userId !== problem.authorId).length;
}

type TranslationBonusEvent = {
  key: string;
  createdAt: Date;
  points: number;
};

async function authoredContentCounts(userIds: number[]) {
  if (userIds.length === 0) {
    return { conceptsByUser: new Map<number, number>(), solutionsByUser: new Map<number, number>() };
  }

  const [concepts, solutions] = await Promise.all([
    prisma.concept.findMany({
      where: { createdById: { in: userIds }, canAppearInConceptBrowser: true },
      select: { createdById: true, translationGroupId: true }
    }),
    prisma.problemProof.findMany({
      where: { authorId: { in: userIds }, problem: { status: ProblemStatus.PUBLISHED } },
      select: { authorId: true, translationGroupId: true }
    })
  ]);

  function countUniqueGroups(rows: Array<{ userId: number; translationGroupId: string }>) {
    const groupsByUser = new Map<number, Set<string>>();
    for (const row of rows) {
      const groups = groupsByUser.get(row.userId) ?? new Set<string>();
      groups.add(row.translationGroupId);
      groupsByUser.set(row.userId, groups);
    }
    return new Map([...groupsByUser].map(([userId, groups]) => [userId, groups.size]));
  }

  return {
    conceptsByUser: countUniqueGroups(concepts.flatMap((concept) =>
      concept.createdById === null ? [] : [{ userId: concept.createdById, translationGroupId: concept.translationGroupId }]
    )),
    solutionsByUser: countUniqueGroups(solutions.map((solution) => ({
      userId: solution.authorId,
      translationGroupId: solution.translationGroupId
    })))
  };
}

async function earnedReputationBonuses(userIds: number[]) {
  const learningByUser = new Map<number, Array<{ translationGroupId: string; solvedAt: Date }>>();
  const translationsByUser = new Map<number, TranslationBonusEvent[]>();
  if (userIds.length === 0) return { learningByUser: new Map<number, number>(), translationsByUser: new Map<number, number>() };

  const [attempts, translatedProblems, translatedConcepts, creationRevisions, translatedHints, translatedProofs] =
    await Promise.all([
      prisma.problemAttempt.findMany({
        where: {
          userId: { in: userIds },
          status: AttemptStatus.SOLVED,
          problem: { status: { not: ProblemStatus.ARCHIVED } }
        },
        select: {
          userId: true,
          solvedAt: true,
          startedAt: true,
          problem: { select: { authorId: true, translationGroupId: true } }
        }
      }),
      prisma.problem.findMany({
        where: { translatedFromProblemId: { not: null }, status: { not: ProblemStatus.ARCHIVED } },
        select: { id: true }
      }),
      prisma.concept.findMany({
        where: { translatedFromConceptId: { not: null } },
        select: { id: true }
      }),
      prisma.pageRevision.findMany({
        where: { editedById: { in: userIds }, isCreation: true },
        select: { pageType: true, pageId: true, editedById: true, createdAt: true }
      }),
      prisma.problemHint.findMany({
        where: { translatedById: { in: userIds }, translatedFromHintId: { not: null } },
        select: { id: true, translatedById: true, createdAt: true }
      }),
      prisma.problemProof.findMany({
        where: { translatedById: { in: userIds }, translatedFromProofId: { not: null } },
        select: { id: true, translatedById: true, createdAt: true }
      })
    ]);

  for (const attempt of attempts) {
    if (attempt.problem.authorId === attempt.userId) continue;
    const events = learningByUser.get(attempt.userId) ?? [];
    events.push({
      translationGroupId: attempt.problem.translationGroupId,
      solvedAt: attempt.solvedAt ?? attempt.startedAt
    });
    learningByUser.set(attempt.userId, events);
  }

  const translatedProblemIds = new Set(translatedProblems.map(({ id }) => id));
  const translatedConceptIds = new Set(translatedConcepts.map(({ id }) => id));
  function addTranslationEvent(userId: number | null, event: TranslationBonusEvent) {
    if (!userId) return;
    const events = translationsByUser.get(userId) ?? [];
    events.push(event);
    translationsByUser.set(userId, events);
  }

  for (const revision of creationRevisions) {
    const isCurrentTranslation =
      (revision.pageType === SourceType.PROBLEM && translatedProblemIds.has(revision.pageId)) ||
      (revision.pageType === SourceType.CONCEPT && translatedConceptIds.has(revision.pageId));
    if (!isCurrentTranslation) continue;
    addTranslationEvent(revision.editedById, {
      key: `${revision.pageType}:${revision.pageId}`,
      createdAt: revision.createdAt,
      points: PAGE_TRANSLATION_REPUTATION_POINTS
    });
  }
  for (const hint of translatedHints) {
    addTranslationEvent(hint.translatedById, {
      key: `hint:${hint.id}`,
      createdAt: hint.createdAt,
      points: COMPANION_TRANSLATION_REPUTATION_POINTS
    });
  }
  for (const proof of translatedProofs) {
    addTranslationEvent(proof.translatedById, {
      key: `proof:${proof.id}`,
      createdAt: proof.createdAt,
      points: COMPANION_TRANSLATION_REPUTATION_POINTS
    });
  }

  return {
    learningByUser: new Map(
      userIds.map((userId) => [userId, learningSolveReputationBonus(learningByUser.get(userId) ?? [])])
    ),
    translationsByUser: new Map(
      userIds.map((userId) => [userId, translationReputationBonus(translationsByUser.get(userId) ?? [])])
    )
  };
}

function summarizeUser(
  user: {
    id: number;
    username: string;
    profileSlug: string;
    displayName: string | null;
    avatarBackground: string | null;
    avatarUrl: string | null;
    role: Role;
    mathLevel: UserMathLevel | null;
    bio: string | null;
    affiliation: string | null;
    websiteUrl: string | null;
    mathematicalDomains: MathDomain[];
    openToCollaboration: boolean;
    createdAt: Date;
    _count: { playlists: number };
  },
  problems: ReputationProblem[],
  dailyProblemCount: number,
  learningReputation: number,
  translationReputation: number,
  contestReputation: number,
  contestWinCount: number,
  conceptCount: number,
  solutionCount: number
): UserReputationSummary {
  return {
    userId: user.id,
    username: user.username,
    profileSlug: user.profileSlug,
    displayName: user.displayName,
    avatarBackground: user.avatarBackground,
    avatarUrl: user.avatarUrl,
    role: user.role,
    mathLevel: user.mathLevel,
    bio: user.bio,
    affiliation: user.affiliation,
    websiteUrl: user.websiteUrl,
    mathematicalDomains: user.mathematicalDomains,
    openToCollaboration: user.openToCollaboration,
    joinedAt: user.createdAt,
    reputation:
      problems.reduce((total, problem) => total + scoreProblem(problem), 0)
      + dailyProblemReputationBonus(dailyProblemCount, user.role)
      + learningReputation
      + translationReputation
      + contestReputation
      + authoredContentReputationBonus(conceptCount, solutionCount),
    problemCount: problems.length,
    solvedCount: problems.reduce((total, problem) => total + solvedCount(problem), 0),
    favoriteCount: problems.reduce((total, problem) => total + favoriteCount(problem), 0),
    engagementCount: problems.reduce((total, problem) => total + engagementCount(problem), 0),
    conceptCount,
    solutionCount,
    explorationCount: user._count.playlists,
    dailyProblemCount,
    contestWinCount
  };
}

export async function getReputationLeaderboard() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      username: true,
      profileSlug: true,
      displayName: true,
      avatarBackground: true,
      avatarUrl: true,
      role: true,
      mathLevel: true,
      bio: true,
      affiliation: true,
      websiteUrl: true,
      mathematicalDomains: true,
      openToCollaboration: true,
      _count: {
        select: {
          playlists: { where: { status: "PUBLISHED", visibility: "PUBLIC" } }
        }
      },
      createdAt: true
    }
  });

  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) return [];

  const [problems, dailyProblems, bonuses, contestWins, authoredCounts] = await Promise.all([
    prisma.problem.findMany({
      where: {
        authorId: { in: userIds },
        status: { not: "ARCHIVED" }
      },
      select: {
        authorId: true,
        translationGroupId: true,
        attempts: {
          where: { status: "SOLVED" },
          select: {
            userId: true,
            user: { select: { role: true } }
          }
        },
        favorites: {
          select: {
            userId: true,
            user: { select: { role: true } }
          }
        }
      }
    }),
    prisma.dailyProblemSchedule.findMany({
      where: {
        dateKey: { lte: dailyProblemDateKey() },
        problem: { authorId: { in: userIds } }
      },
      select: { problem: { select: { authorId: true } } }
    }),
    earnedReputationBonuses(userIds),
    prisma.problemContestSubmission.findMany({
      where: {
        userId: { in: userIds },
        placement: "WINNER",
        contest: { resultsPublishedAt: { not: null } }
      },
      select: { userId: true, contest: { select: { rewardPoints: true } } }
    }),
    authoredContentCounts(userIds)
  ]);

  const problemsByAuthor = new Map<number, ReputationProblem[]>();
  for (const problem of mergeTranslatedProblems(problems)) {
    const existing = problemsByAuthor.get(problem.authorId) ?? [];
    existing.push(problem);
    problemsByAuthor.set(problem.authorId, existing);
  }

  const dailyProblemsByAuthor = new Map<number, number>();
  for (const selection of dailyProblems) {
    const authorId = selection.problem.authorId;
    dailyProblemsByAuthor.set(authorId, (dailyProblemsByAuthor.get(authorId) ?? 0) + 1);
  }

  const contestReputationByUser = new Map<number, number>();
  const contestWinsByUser = new Map<number, number>();
  for (const win of contestWins) {
    contestReputationByUser.set(win.userId, (contestReputationByUser.get(win.userId) ?? 0) + win.contest.rewardPoints);
    contestWinsByUser.set(win.userId, (contestWinsByUser.get(win.userId) ?? 0) + 1);
  }

  return users.map((user) => summarizeUser(
    user,
    problemsByAuthor.get(user.id) ?? [],
    dailyProblemsByAuthor.get(user.id) ?? 0,
    bonuses.learningByUser.get(user.id) ?? 0,
    bonuses.translationsByUser.get(user.id) ?? 0,
    contestReputationByUser.get(user.id) ?? 0,
    contestWinsByUser.get(user.id) ?? 0,
    authoredCounts.conceptsByUser.get(user.id) ?? 0,
    authoredCounts.solutionsByUser.get(user.id) ?? 0
  ));
}

export async function getUserReputation(userId: number) {
  const [user, problems, dailyProblemCount, bonuses, contestWins, authoredCounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    }),
    prisma.problem.findMany({
      where: {
        authorId: userId,
        status: { not: "ARCHIVED" }
      },
      select: {
        authorId: true,
        translationGroupId: true,
        attempts: {
          where: { status: "SOLVED" },
          select: {
            userId: true,
            user: { select: { role: true } }
          }
        },
        favorites: {
          select: {
            userId: true,
            user: { select: { role: true } }
          }
        }
      }
    }),
    prisma.dailyProblemSchedule.count({
      where: {
        dateKey: { lte: dailyProblemDateKey() },
        problem: { authorId: userId }
      }
    }),
    earnedReputationBonuses([userId]),
    prisma.problemContestSubmission.findMany({
      where: { userId, placement: "WINNER", contest: { resultsPublishedAt: { not: null } } },
      select: { contest: { select: { rewardPoints: true } } }
    }),
    authoredContentCounts([userId])
  ]);

  return mergeTranslatedProblems(problems).reduce((total, problem) => total + scoreProblem(problem), 0)
    + (user ? dailyProblemReputationBonus(dailyProblemCount, user.role) : 0)
    + (bonuses.learningByUser.get(userId) ?? 0)
    + (bonuses.translationsByUser.get(userId) ?? 0)
    + contestWins.reduce((total, win) => total + win.contest.rewardPoints, 0)
    + authoredContentReputationBonus(
      authoredCounts.conceptsByUser.get(userId) ?? 0,
      authoredCounts.solutionsByUser.get(userId) ?? 0
    );
}
