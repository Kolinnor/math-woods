import { Role, UserMathLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasTrustedPrivileges } from "@/lib/permissions";
import { DISPLAY_NAME_MAX_LENGTH, displayNameForUser } from "@/lib/user-display";

type ReputationProblem = {
  authorId: number;
  attempts: Array<{
    userId: number;
    user: { role: Role };
  }>;
  favorites: Array<{
    userId: number;
    user: { role: Role };
  }>;
};

export type UserReputationSummary = {
  userId: number;
  username: string;
  displayName: string | null;
  role: Role;
  mathLevel: UserMathLevel | null;
  joinedAt: Date;
  reputation: number;
  problemCount: number;
  solvedCount: number;
  favoriteCount: number;
  engagementCount: number;
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

function summarizeUser(
  user: {
    id: number;
    username: string;
    displayName: string | null;
    role: Role;
    mathLevel: UserMathLevel | null;
    createdAt: Date;
  },
  problems: ReputationProblem[]
): UserReputationSummary {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mathLevel: user.mathLevel,
    joinedAt: user.createdAt,
    reputation: problems.reduce((total, problem) => total + scoreProblem(problem), 0),
    problemCount: problems.length,
    solvedCount: problems.reduce((total, problem) => total + solvedCount(problem), 0),
    favoriteCount: problems.reduce((total, problem) => total + favoriteCount(problem), 0),
    engagementCount: problems.reduce((total, problem) => total + engagementCount(problem), 0)
  };
}

export async function getReputationLeaderboard() {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { emailVerifiedAt: { not: null } },
        { role: { in: [Role.MODERATOR, Role.ADMIN, Role.OWNER] } }
      ]
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      mathLevel: true,
      createdAt: true
    }
  });

  const visibleUsers = users.filter((user) => displayNameForUser(user).length <= DISPLAY_NAME_MAX_LENGTH);
  const userIds = visibleUsers.map((user) => user.id);
  if (userIds.length === 0) return [];

  const problems = await prisma.problem.findMany({
    where: {
      authorId: { in: userIds },
      status: { not: "ARCHIVED" }
    },
    select: {
      authorId: true,
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
  });

  const problemsByAuthor = new Map<number, ReputationProblem[]>();
  for (const problem of problems) {
    const existing = problemsByAuthor.get(problem.authorId) ?? [];
    existing.push(problem);
    problemsByAuthor.set(problem.authorId, existing);
  }

  return visibleUsers.map((user) => summarizeUser(user, problemsByAuthor.get(user.id) ?? []));
}

export async function getUserReputation(userId: number) {
  const problems = await prisma.problem.findMany({
    where: {
      authorId: userId,
      status: { not: "ARCHIVED" }
    },
    select: {
      authorId: true,
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
  });

  return problems.reduce((total, problem) => total + scoreProblem(problem), 0);
}
