"use server";

import { NotificationType, Role, TrustedUserRecommendationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";

type TrustedUserDecision = "approve" | "decline";

export async function decideTrustedUserRecommendationAction(
  recommendationId: number,
  decision: TrustedUserDecision,
  _formData: FormData
) {
  const owner = await requireOwner();
  await assertRateLimit(`trusted-user-review:${owner.id}`, 20, 60_000);
  if (!Number.isInteger(recommendationId) || recommendationId <= 0) throw new Error("Invalid recommendation.");
  if (decision !== "approve" && decision !== "decline") throw new Error("Invalid decision.");

  const result = await prisma.$transaction(async (tx) => {
    const recommendation = await tx.trustedUserRecommendation.findUnique({
      where: { id: recommendationId },
      include: {
        user: {
          select: { id: true, username: true, profileSlug: true, displayName: true, role: true, deletedAt: true }
        }
      }
    });
    if (!recommendation) throw new Error("Recommendation not found.");
    if (recommendation.status !== TrustedUserRecommendationStatus.PENDING) {
      return { status: recommendation.status, promotedUser: null, targetProfileSlug: recommendation.user.profileSlug };
    }

    const now = new Date();
    if (decision === "decline") {
      await tx.trustedUserRecommendation.update({
        where: { id: recommendation.id },
        data: {
          status: TrustedUserRecommendationStatus.DECLINED,
          decidedById: owner.id,
          decidedAt: now
        }
      });
      if (recommendation.notificationId) {
        await tx.notification.updateMany({
          where: { id: recommendation.notificationId, userId: owner.id, readAt: null },
          data: { readAt: now }
        });
      }
      return {
        status: TrustedUserRecommendationStatus.DECLINED,
        promotedUser: null,
        targetProfileSlug: recommendation.user.profileSlug
      };
    }

    const promoted = await tx.user.updateMany({
      where: { id: recommendation.user.id, role: Role.USER, deletedAt: null },
      data: { role: Role.MODERATOR }
    });
    const status = promoted.count > 0
      ? TrustedUserRecommendationStatus.APPROVED
      : TrustedUserRecommendationStatus.INVALIDATED;
    await tx.trustedUserRecommendation.update({
      where: { id: recommendation.id },
      data: { status, decidedById: owner.id, decidedAt: now }
    });
    if (recommendation.notificationId) {
      await tx.notification.updateMany({
        where: { id: recommendation.notificationId, userId: owner.id, readAt: null },
        data: { readAt: now }
      });
    }

    return {
      status,
      promotedUser: promoted.count > 0 ? recommendation.user : null,
      targetProfileSlug: recommendation.user.profileSlug
    };
  });

  if (result.promotedUser) {
    await createNotification({
      userId: result.promotedUser.id,
      actorId: owner.id,
      type: NotificationType.TRUSTED_USER_PROMOTED,
      title: "You are now a trusted user",
      body: "You now have access to the trusted-user contribution and moderation tools.",
      href: `/profile/${result.promotedUser.profileSlug}`
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  revalidatePath("/settings");
  revalidatePath("/moderation");
  revalidatePath("/users");
  revalidatePath(`/profile/${result.targetProfileSlug}`);
  redirect(`/notifications?trustedReview=${result.status.toLowerCase()}#trusted-user-review-${recommendationId}`);
}
