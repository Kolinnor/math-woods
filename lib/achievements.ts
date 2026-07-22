import { NotificationType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export const ACHIEVEMENTS = [
  {
    key: "first-clearing",
    title: "First Clearing",
    description: "Solve your first problem."
  },
  {
    key: "pathfinder",
    title: "Pathfinder",
    description: "Solve 10 problems."
  },
  {
    key: "ascending-the-mountain",
    title: "Ascending the Mountain",
    description: "Solve 100 problems."
  },
  {
    key: "lantern-bearer",
    title: "Lantern Bearer",
    description: "Add your first hint to a problem."
  },
  {
    key: "the-helpful-stranger",
    title: "The Helpful Stranger",
    description: "Receive 10 useful votes on hints or discussion posts."
  },
  {
    key: "proofsmith",
    title: "Solution Smith",
    description: "Publish your first solution."
  },
  {
    key: "cartographer",
    title: "Cartographer",
    description: "Create 10 concept pages."
  },
  {
    key: "trail-maker",
    title: "Trail Maker",
    description: "Have 5 of your contributed problems solved by other users."
  }
] as const;

export type AchievementKey = (typeof ACHIEVEMENTS)[number]["key"];

const achievementByKey = new Map(ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]));

async function unlockAchievement(userId: number, key: AchievementKey) {
  const achievement = achievementByKey.get(key);
  if (!achievement) return null;

  try {
    const unlock = await prisma.achievementUnlock.create({
      data: {
        userId,
        key: achievement.key,
        title: achievement.title,
        description: achievement.description
      }
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });
    await createNotification({
      userId,
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: "Achievement unlocked",
      body: `${achievement.title}: ${achievement.description}`,
      href: user ? `/profile/${user.username}?view=achievements` : "/me"
    });
    if (user) revalidatePath(`/profile/${user.username}`);
    revalidatePath("/me");
    return unlock;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}

export async function checkSolveAchievements(userId: number) {
  const solvedAttempts = await prisma.problemAttempt.findMany({
    where: { userId, status: "SOLVED" },
    select: { problem: { select: { translationGroupId: true } } }
  });
  const solvedCount = new Set(solvedAttempts.map((attempt) => attempt.problem.translationGroupId)).size;

  if (solvedCount >= 1) await unlockAchievement(userId, "first-clearing");
  if (solvedCount >= 10) await unlockAchievement(userId, "pathfinder");
  if (solvedCount >= 100) await unlockAchievement(userId, "ascending-the-mountain");
}

export async function checkHintAchievements(userId: number) {
  const [discussionHintCount, solutionHintCount] = await Promise.all([
    prisma.discussionPost.count({
      where: { authorId: userId, type: "HINT", deletedAt: null }
    }),
    prisma.problemHint.count({ where: { authorId: userId } })
  ]);

  if (discussionHintCount + solutionHintCount >= 1) await unlockAchievement(userId, "lantern-bearer");
}

export async function checkUsefulPostAchievements(userId: number) {
  const posts = await prisma.discussionPost.findMany({
    where: { authorId: userId, deletedAt: null },
    select: { id: true }
  });
  if (posts.length === 0) return;

  const voteCount = await prisma.vote.count({
    where: {
      targetType: "POST",
      targetId: { in: posts.map((post) => post.id) },
      userId: { not: userId }
    }
  });

  if (voteCount >= 10) await unlockAchievement(userId, "the-helpful-stranger");
}

export async function checkProofAchievements(userId: number) {
  const proofCount = await prisma.problemProof.count({
    where: { authorId: userId }
  });

  if (proofCount >= 1) await unlockAchievement(userId, "proofsmith");
}

export async function checkConceptAchievements(userId: number) {
  const conceptCount = await prisma.concept.count({
    where: { createdById: userId }
  });

  if (conceptCount >= 10) await unlockAchievement(userId, "cartographer");
}

export async function checkProblemSolvedByOthersAchievements(userId: number) {
  const solvedProblems = await prisma.problemAttempt.findMany({
    where: {
      status: "SOLVED",
      userId: { not: userId },
      problem: { authorId: userId }
    },
    select: { problem: { select: { translationGroupId: true } } }
  });
  const solvedProblemGroups = new Set(solvedProblems.map((attempt) => attempt.problem.translationGroupId));

  if (solvedProblemGroups.size >= 5) await unlockAchievement(userId, "trail-maker");
}
