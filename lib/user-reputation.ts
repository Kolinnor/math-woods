import {
  AttemptStatus,
  ConceptStatus,
  MathDomain,
  ProblemStatus,
  QualityStatus,
  Role,
  SourceType,
  TargetType,
  UserMathLevel,
  VoteType
} from "@prisma/client";
import { dailyProblemDateKey } from "@/lib/daily-problem-schedule";
import { prisma } from "@/lib/db";
import { hasTrustedPrivileges } from "@/lib/permissions";
import {
  authoredConceptReputationBonus,
  COMPANION_TRANSLATION_REPUTATION_POINTS,
  contentHasIllustration,
  curationActivityReputationBonus,
  dailyProblemReputationBonus,
  learningSolveReputationBonus,
  PAGE_TRANSLATION_REPUTATION_POINTS,
  problemAuthorshipReputationBonus,
  reviewedContributionReputationBonus,
  solutionAuthorshipReputationBonus,
  translationReputationBonus
} from "@/lib/reputation-scoring";
import { displayNameForUser } from "@/lib/user-display";

type ReputationProblem = {
  authorId: number;
  translationGroupId: string;
  hasIllustration: boolean;
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
    existing.hasIllustration ||= problem.hasIllustration;
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
  translationCount: number;
  contestWinCount?: number;
};

function scoreProblem(problem: ReputationProblem) {
  const externalFavorites = problem.favorites.filter((favorite) => favorite.userId !== problem.authorId);
  return problemAuthorshipReputationBonus({
    favoriteCount: externalFavorites.length,
    trustedFavoriteCount: externalFavorites.filter((favorite) => hasTrustedPrivileges(favorite.user.role)).length,
    solveCount: problem.attempts.filter((attempt) => attempt.userId !== problem.authorId).length,
    hasIllustration: problem.hasIllustration
  });
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
    return {
      conceptsByUser: new Map<number, number>(),
      solutionsByUser: new Map<number, number>(),
      solutionReputationByUser: new Map<number, number>()
    };
  }

  const [concepts, solutions, mergedConceptCredits] = await Promise.all([
    prisma.concept.findMany({
      where: { createdById: { in: userIds }, status: { not: ConceptStatus.MISSING } },
      select: { createdById: true, translationGroupId: true }
    }),
    prisma.problemProof.findMany({
      where: { authorId: { in: userIds }, problem: { status: ProblemStatus.PUBLISHED } },
      select: { id: true, authorId: true, translatedById: true, translationGroupId: true, bodyMarkdown: true }
    }),
    prisma.conceptMergeContributor.findMany({
      where: {
        userId: { in: userIds },
        concept: { status: { not: ConceptStatus.MISSING } }
      },
      select: {
        userId: true,
        concept: { select: { translationGroupId: true } }
      }
    })
  ]);

  const solutionVotes = solutions.length === 0
    ? []
    : await prisma.vote.findMany({
      where: {
        targetType: TargetType.PROOF,
        voteType: VoteType.UP,
        targetId: { in: solutions.map((solution) => solution.id) }
      },
      select: { userId: true, targetId: true }
    });

  function countUniqueGroups(rows: Array<{ userId: number; translationGroupId: string }>) {
    const groupsByUser = new Map<number, Set<string>>();
    for (const row of rows) {
      const groups = groupsByUser.get(row.userId) ?? new Set<string>();
      groups.add(row.translationGroupId);
      groupsByUser.set(row.userId, groups);
    }
    return new Map([...groupsByUser].map(([userId, groups]) => [userId, groups.size]));
  }

  const solutionById = new Map(solutions.map((solution) => [solution.id, solution]));
  const solutionGroups = new Map<string, {
    authorId: number;
    contributorIds: Set<number>;
    voterIds: Set<number>;
    hasIllustration: boolean;
  }>();
  for (const solution of solutions) {
    const key = `${solution.authorId}:${solution.translationGroupId}`;
    const group = solutionGroups.get(key) ?? {
      authorId: solution.authorId,
      contributorIds: new Set<number>([solution.authorId]),
      voterIds: new Set<number>(),
      hasIllustration: false
    };
    if (solution.translatedById) group.contributorIds.add(solution.translatedById);
    group.hasIllustration ||= contentHasIllustration(solution.bodyMarkdown);
    solutionGroups.set(key, group);
  }
  for (const vote of solutionVotes) {
    const solution = solutionById.get(vote.targetId);
    if (!solution) continue;
    const group = solutionGroups.get(`${solution.authorId}:${solution.translationGroupId}`);
    if (!group || group.contributorIds.has(vote.userId)) continue;
    group.voterIds.add(vote.userId);
  }

  const solutionReputationByUser = new Map<number, number>();
  for (const group of solutionGroups.values()) {
    const score = solutionAuthorshipReputationBonus({
      usefulVoteCount: group.voterIds.size,
      hasIllustration: group.hasIllustration
    });
    solutionReputationByUser.set(group.authorId, (solutionReputationByUser.get(group.authorId) ?? 0) + score);
  }

  return {
    conceptsByUser: countUniqueGroups([
      ...concepts.flatMap((concept) =>
        concept.createdById === null ? [] : [{ userId: concept.createdById, translationGroupId: concept.translationGroupId }]
      ),
      ...mergedConceptCredits.map((credit) => ({
        userId: credit.userId,
        translationGroupId: credit.concept.translationGroupId
      }))
    ]),
    solutionsByUser: countUniqueGroups(solutions.map((solution) => ({
      userId: solution.authorId,
      translationGroupId: solution.translationGroupId
    }))),
    solutionReputationByUser
  };
}

async function reviewedContributionCounts(userIds: number[]) {
  const counts = new Map<number, number>();
  if (userIds.length === 0) return counts;

  const [problems, concepts, revisions] = await Promise.all([
    prisma.problem.findMany({
      where: {
        status: { not: ProblemStatus.ARCHIVED },
        qualityStatus: QualityStatus.REVIEWED,
        needsReviewAfterEdit: false
      },
      select: { id: true, authorId: true, translationGroupId: true }
    }),
    prisma.concept.findMany({
      where: {
        canAppearInConceptBrowser: true,
        status: { in: [ConceptStatus.REVIEWED, ConceptStatus.EXCELLENT] },
        needsReviewAfterEdit: false
      },
      select: { id: true, createdById: true, translationGroupId: true }
    }),
    prisma.pageRevision.findMany({
      where: {
        editedById: { in: userIds },
        isCreation: false,
        pageType: { in: [SourceType.PROBLEM, SourceType.CONCEPT] }
      },
      select: { pageType: true, pageId: true, editedById: true }
    })
  ]);

  const reviewedPages = new Map<string, { ownerId: number | null; groupKey: string }>();
  for (const problem of problems) {
    reviewedPages.set(`${SourceType.PROBLEM}:${problem.id}`, {
      ownerId: problem.authorId,
      groupKey: `${SourceType.PROBLEM}:${problem.translationGroupId}`
    });
  }
  for (const concept of concepts) {
    reviewedPages.set(`${SourceType.CONCEPT}:${concept.id}`, {
      ownerId: concept.createdById,
      groupKey: `${SourceType.CONCEPT}:${concept.translationGroupId}`
    });
  }

  const groupsByUser = new Map<number, Set<string>>();
  for (const revision of revisions) {
    if (!revision.editedById) continue;
    const page = reviewedPages.get(`${revision.pageType}:${revision.pageId}`);
    if (!page || page.ownerId === revision.editedById) continue;
    const groups = groupsByUser.get(revision.editedById) ?? new Set<string>();
    groups.add(page.groupKey);
    groupsByUser.set(revision.editedById, groups);
  }

  for (const [userId, groups] of groupsByUser) counts.set(userId, groups.size);
  return counts;
}

async function curationActivityCounts(userIds: number[]) {
  const counts = new Map<number, number>();
  if (userIds.length === 0) return counts;

  const [favorites, proofVotes] = await Promise.all([
    prisma.problemFavorite.findMany({
      where: { userId: { in: userIds }, problem: { status: { not: ProblemStatus.ARCHIVED } } },
      select: {
        userId: true,
        problem: { select: { authorId: true, translationGroupId: true } }
      }
    }),
    prisma.vote.findMany({
      where: { userId: { in: userIds }, targetType: TargetType.PROOF, voteType: VoteType.UP },
      select: { userId: true, targetId: true }
    })
  ]);

  const proofs = proofVotes.length === 0
    ? []
    : await prisma.problemProof.findMany({
      where: { id: { in: [...new Set(proofVotes.map((vote) => vote.targetId))] } },
      select: { id: true, authorId: true, translatedById: true, translationGroupId: true }
    });
  const proofById = new Map(proofs.map((proof) => [proof.id, proof]));
  const itemsByUser = new Map<number, Set<string>>();

  function addItem(userId: number, key: string) {
    const items = itemsByUser.get(userId) ?? new Set<string>();
    items.add(key);
    itemsByUser.set(userId, items);
  }

  for (const favorite of favorites) {
    if (favorite.userId === favorite.problem.authorId) continue;
    addItem(favorite.userId, `problem:${favorite.problem.translationGroupId}`);
  }
  for (const vote of proofVotes) {
    const proof = proofById.get(vote.targetId);
    if (!proof || vote.userId === proof.authorId || vote.userId === proof.translatedById) continue;
    addItem(vote.userId, `proof:${proof.translationGroupId}`);
  }

  for (const [userId, items] of itemsByUser) counts.set(userId, items.size);
  return counts;
}

async function earnedReputationBonuses(userIds: number[], problemScoresByGroup: Map<string, number>) {
  const learningByUser = new Map<number, Array<{ translationGroupId: string; solvedAt: Date }>>();
  const translationsByUser = new Map<number, TranslationBonusEvent[]>();
  const translatedProblemScoresByUser = new Map<number, Map<number, number>>();
  if (userIds.length === 0) {
    return {
      learningByUser: new Map<number, number>(),
      translationsByUser: new Map<number, number>(),
      translationCountsByUser: new Map<number, number>()
    };
  }

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
        select: { id: true, translationGroupId: true }
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

  const translatedProblemById = new Map(translatedProblems.map((problem) => [problem.id, problem]));
  const translatedConceptIds = new Set(translatedConcepts.map(({ id }) => id));
  const resolvedProblemScoresByGroup = new Map(problemScoresByGroup);
  const missingTranslatedGroupIds = [...new Set(creationRevisions.flatMap((revision) => {
    if (revision.pageType !== SourceType.PROBLEM) return [];
    const groupId = translatedProblemById.get(revision.pageId)?.translationGroupId;
    return groupId && !resolvedProblemScoresByGroup.has(groupId) ? [groupId] : [];
  }))];
  if (missingTranslatedGroupIds.length > 0) {
    const translatedGroupProblems = await prisma.problem.findMany({
      where: {
        translationGroupId: { in: missingTranslatedGroupIds },
        status: { not: ProblemStatus.ARCHIVED }
      },
      select: {
        authorId: true,
        translationGroupId: true,
        bodyMarkdown: true,
        attempts: {
          where: { status: AttemptStatus.SOLVED },
          select: { userId: true, user: { select: { role: true } } }
        },
        favorites: {
          select: { userId: true, user: { select: { role: true } } }
        }
      }
    });
    const mergedTranslatedGroups = mergeTranslatedProblems(translatedGroupProblems.map((problem) => ({
      ...problem,
      hasIllustration: contentHasIllustration(problem.bodyMarkdown)
    })));
    for (const problem of mergedTranslatedGroups) {
      resolvedProblemScoresByGroup.set(problem.translationGroupId, scoreProblem(problem));
    }
  }
  function addTranslationEvent(userId: number | null, event: TranslationBonusEvent) {
    if (!userId) return;
    const events = translationsByUser.get(userId) ?? [];
    events.push(event);
    translationsByUser.set(userId, events);
  }

  for (const revision of creationRevisions) {
    if (revision.pageType === SourceType.PROBLEM) {
      const translatedProblem = translatedProblemById.get(revision.pageId);
      if (!translatedProblem || !revision.editedById) continue;
      const scores = translatedProblemScoresByUser.get(revision.editedById) ?? new Map<number, number>();
      scores.set(revision.pageId, resolvedProblemScoresByGroup.get(translatedProblem.translationGroupId) ?? 0);
      translatedProblemScoresByUser.set(revision.editedById, scores);
      continue;
    }
    if (revision.pageType !== SourceType.CONCEPT || !translatedConceptIds.has(revision.pageId)) continue;
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

  function translationCountForUser(userId: number) {
    const translatedItems = new Set((translationsByUser.get(userId) ?? []).map((event) => event.key));
    for (const problemId of translatedProblemScoresByUser.get(userId)?.keys() ?? []) {
      translatedItems.add(`${SourceType.PROBLEM}:${problemId}`);
    }
    return translatedItems.size;
  }

  return {
    learningByUser: new Map(
      userIds.map((userId) => [userId, learningSolveReputationBonus(learningByUser.get(userId) ?? [])])
    ),
    translationsByUser: new Map(
      userIds.map((userId) => [
        userId,
        translationReputationBonus(translationsByUser.get(userId) ?? [])
          + [...(translatedProblemScoresByUser.get(userId)?.values() ?? [])].reduce((total, score) => total + score, 0)
      ])
    ),
    translationCountsByUser: new Map(
      userIds.map((userId) => [userId, translationCountForUser(userId)])
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
  translationCount: number,
  contestReputation: number,
  contestWinCount: number,
  conceptCount: number,
  solutionCount: number,
  solutionReputation: number,
  reviewedContributionCount: number,
  curatedItemCount: number
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
      + authoredConceptReputationBonus(conceptCount)
      + solutionReputation
      + reviewedContributionReputationBonus(reviewedContributionCount)
      + curationActivityReputationBonus(curatedItemCount),
    problemCount: problems.length,
    solvedCount: problems.reduce((total, problem) => total + solvedCount(problem), 0),
    favoriteCount: problems.reduce((total, problem) => total + favoriteCount(problem), 0),
    engagementCount: problems.reduce((total, problem) => total + engagementCount(problem), 0),
    conceptCount,
    solutionCount,
    explorationCount: user._count.playlists,
    dailyProblemCount,
    translationCount,
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

  const [rawProblems, dailyProblems, contestWins, authoredCounts, reviewedCounts, curationCounts] = await Promise.all([
    prisma.problem.findMany({
      where: {
        authorId: { in: userIds },
        status: { not: "ARCHIVED" }
      },
      select: {
        authorId: true,
        translationGroupId: true,
        bodyMarkdown: true,
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
    prisma.problemContestSubmission.findMany({
      where: {
        userId: { in: userIds },
        placement: "WINNER",
        contest: { resultsPublishedAt: { not: null } }
      },
      select: { userId: true, contest: { select: { rewardPoints: true } } }
    }),
    authoredContentCounts(userIds),
    reviewedContributionCounts(userIds),
    curationActivityCounts(userIds)
  ]);

  const problems = mergeTranslatedProblems(rawProblems.map((problem) => ({
    ...problem,
    hasIllustration: contentHasIllustration(problem.bodyMarkdown)
  })));
  const problemScoresByGroup = new Map(problems.map((problem) => [problem.translationGroupId, scoreProblem(problem)]));
  const bonuses = await earnedReputationBonuses(userIds, problemScoresByGroup);

  const problemsByAuthor = new Map<number, ReputationProblem[]>();
  for (const problem of problems) {
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
    bonuses.translationCountsByUser.get(user.id) ?? 0,
    contestReputationByUser.get(user.id) ?? 0,
    contestWinsByUser.get(user.id) ?? 0,
    authoredCounts.conceptsByUser.get(user.id) ?? 0,
    authoredCounts.solutionsByUser.get(user.id) ?? 0,
    authoredCounts.solutionReputationByUser.get(user.id) ?? 0,
    reviewedCounts.get(user.id) ?? 0,
    curationCounts.get(user.id) ?? 0
  ));
}

export async function getUserReputation(userId: number) {
  const [user, rawProblems, dailyProblemCount, contestWins, authoredCounts, reviewedCounts, curationCounts] = await Promise.all([
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
        bodyMarkdown: true,
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
    prisma.problemContestSubmission.findMany({
      where: { userId, placement: "WINNER", contest: { resultsPublishedAt: { not: null } } },
      select: { contest: { select: { rewardPoints: true } } }
    }),
    authoredContentCounts([userId]),
    reviewedContributionCounts([userId]),
    curationActivityCounts([userId])
  ]);

  const problems = mergeTranslatedProblems(rawProblems.map((problem) => ({
    ...problem,
    hasIllustration: contentHasIllustration(problem.bodyMarkdown)
  })));
  const problemScoresByGroup = new Map(problems.map((problem) => [problem.translationGroupId, scoreProblem(problem)]));
  const bonuses = await earnedReputationBonuses([userId], problemScoresByGroup);

  return problems.reduce((total, problem) => total + scoreProblem(problem), 0)
    + (user ? dailyProblemReputationBonus(dailyProblemCount, user.role) : 0)
    + (bonuses.learningByUser.get(userId) ?? 0)
    + (bonuses.translationsByUser.get(userId) ?? 0)
    + contestWins.reduce((total, win) => total + win.contest.rewardPoints, 0)
    + authoredConceptReputationBonus(authoredCounts.conceptsByUser.get(userId) ?? 0)
    + (authoredCounts.solutionReputationByUser.get(userId) ?? 0)
    + reviewedContributionReputationBonus(reviewedCounts.get(userId) ?? 0)
    + curationActivityReputationBonus(curationCounts.get(userId) ?? 0);
}
