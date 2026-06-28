import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const achievements = [
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
];

const achievementByKey = new Map(achievements.map((achievement) => [achievement.key, achievement]));

async function eligibleAchievementKeys(userId) {
  const [solvedCount, hintCount, proofCount, conceptCount, posts, solvedProblemGroups] = await Promise.all([
    prisma.problemAttempt.count({
      where: { userId, status: "SOLVED" }
    }),
    prisma.discussionPost.count({
      where: { authorId: userId, type: "HINT", deletedAt: null }
    }),
    prisma.problemProof.count({
      where: { authorId: userId }
    }),
    prisma.concept.count({
      where: { createdById: userId }
    }),
    prisma.discussionPost.findMany({
      where: { authorId: userId, deletedAt: null },
      select: { id: true }
    }),
    prisma.problemAttempt.groupBy({
      by: ["problemId"],
      where: {
        status: "SOLVED",
        userId: { not: userId },
        problem: { authorId: userId }
      }
    })
  ]);

  const keys = [];
  if (solvedCount >= 1) keys.push("first-clearing");
  if (solvedCount >= 10) keys.push("pathfinder");
  if (solvedCount >= 100) keys.push("ascending-the-mountain");
  if (hintCount >= 1) keys.push("lantern-bearer");
  if (proofCount >= 1) keys.push("proofsmith");
  if (conceptCount >= 10) keys.push("cartographer");
  if (solvedProblemGroups.length >= 5) keys.push("trail-maker");

  if (posts.length > 0) {
    const voteCount = await prisma.vote.count({
      where: {
        targetType: "POST",
        targetId: { in: posts.map((post) => post.id) },
        userId: { not: userId }
      }
    });
    if (voteCount >= 10) keys.push("the-helpful-stranger");
  }

  return keys;
}

async function notificationEnabled(userId) {
  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId_type: {
        userId,
        type: "ACHIEVEMENT_UNLOCKED"
      }
    },
    select: { enabled: true }
  });

  return preference?.enabled !== false;
}

async function unlockMissingAchievements(user, keys) {
  const existingUnlocks = await prisma.achievementUnlock.findMany({
    where: {
      userId: user.id,
      key: { in: keys }
    },
    select: { key: true }
  });
  const existingKeys = new Set(existingUnlocks.map((unlock) => unlock.key));
  const missing = keys.filter((key) => !existingKeys.has(key));

  if (missing.length === 0) return 0;

  const sendNotifications = await notificationEnabled(user.id);
  let createdCount = 0;

  for (const key of missing) {
    const achievement = achievementByKey.get(key);
    if (!achievement) continue;

    const created = await prisma.$transaction(async (tx) => {
      const unlock = await tx.achievementUnlock.create({
        data: {
          userId: user.id,
          key: achievement.key,
          title: achievement.title,
          description: achievement.description
        }
      });

      if (sendNotifications) {
        await tx.notification.create({
          data: {
            userId: user.id,
            type: "ACHIEVEMENT_UNLOCKED",
            title: "Achievement unlocked",
            body: `${achievement.title}: ${achievement.description}`,
            href: `/profile/${user.username}?view=achievements`
          }
        });
      }

      return unlock;
    }).catch((error) => {
      if (error?.code === "P2002") return null;
      throw error;
    });

    if (created) createdCount += 1;
  }

  return createdCount;
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { id: "asc" }
  });

  let total = 0;
  for (const user of users) {
    const keys = await eligibleAchievementKeys(user.id);
    total += await unlockMissingAchievements(user, keys);
  }

  console.log(`Achievement backfill complete. Users checked: ${users.length}. Unlocks created: ${total}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
