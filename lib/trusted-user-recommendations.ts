import { NotificationType, Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  isTrustedUserCandidate,
  TRUSTED_USER_REPUTATION_THRESHOLD
} from "@/lib/trusted-user-policy";
import { getReputationLeaderboard } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";

export async function maybeCreateTrustedUserRecommendation(userId: number, reputation: number) {
  if (!isTrustedUserCandidate(Role.USER, reputation)) return false;

  const owner = await prisma.user.findFirst({
    where: { role: Role.OWNER, deletedAt: null },
    orderBy: { id: "asc" },
    select: { id: true }
  });
  if (!owner) return false;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const candidate = await tx.user.findFirst({
        where: { id: userId, role: Role.USER, deletedAt: null },
        select: { id: true, username: true, displayName: true }
      });
      if (!candidate) return null;

      const recommendation = await tx.trustedUserRecommendation.create({
        data: {
          userId: candidate.id,
          reputation,
          threshold: TRUSTED_USER_REPUTATION_THRESHOLD
        },
        select: { id: true }
      });
      const notification = await tx.notification.create({
        data: {
          userId: owner.id,
          actorId: candidate.id,
          type: NotificationType.TRUSTED_USER_CANDIDATE,
          title: "Trusted user suggestion",
          body: `${displayNameForUser(candidate)} has reached ${reputation} reputation. Would you like to make them a trusted user?`,
          href: `/notifications#trusted-user-review-${recommendation.id}`
        },
        select: { id: true }
      });
      await tx.trustedUserRecommendation.update({
        where: { id: recommendation.id },
        data: { notificationId: notification.id }
      });
      return recommendation;
    });

    if (!created) return false;
    revalidatePath("/", "layout");
    revalidatePath("/notifications");
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function scanTrustedUserCandidates() {
  const users = await getReputationLeaderboard();
  const candidates = users.filter((user) => isTrustedUserCandidate(user.role, user.reputation));
  let created = 0;

  for (const candidate of candidates) {
    if (await maybeCreateTrustedUserRecommendation(candidate.userId, candidate.reputation)) created += 1;
  }

  return { ok: true, candidates: candidates.length, created };
}
