"use server";

import type { Route } from "next";
import {
  NotificationType,
  SiteImprovementActivityType,
  SiteImprovementCompletionReviewStatus,
  SiteImprovementStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModerator, requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { canUseAdminTools, canUseOwnerTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  parseSiteImprovementPriority,
  parseSiteImprovementStatus
} from "@/lib/site-improvements";

const BOARD_PATH = "/contributing/tasks/site-improvements";

function improvementPath(id: number) {
  return `${BOARD_PATH}/${id}` as Route;
}

function revalidateImprovement(id: number) {
  revalidatePath(BOARD_PATH);
  revalidatePath(improvementPath(id));
}

export async function createSiteImprovementAction(formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:create:${user.id}`, 8, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const descriptionMarkdown = requiredBoundedText(
    formData.get("descriptionMarkdown"),
    CONTENT_LIMITS.longNote,
    "Description"
  );
  const priority = parseSiteImprovementPriority(formData.get("priority"));
  const descriptionHtml = await renderMarkdown(descriptionMarkdown);

  const improvement = await prisma.$transaction(async (tx) => {
    const created = await tx.siteImprovement.create({
      data: {
        title,
        descriptionMarkdown,
        descriptionHtml,
        priority,
        creatorId: user.id
      }
    });
    await tx.siteImprovementActivity.create({
      data: {
        improvementId: created.id,
        actorId: user.id,
        type: SiteImprovementActivityType.CREATED,
        toValue: SiteImprovementStatus.BACKLOG
      }
    });
    return created;
  });

  revalidateImprovement(improvement.id);
  redirect(improvementPath(improvement.id));
}

export async function updateSiteImprovementDetailsAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:details:${user.id}`, 30, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const descriptionMarkdown = requiredBoundedText(
    formData.get("descriptionMarkdown"),
    CONTENT_LIMITS.longNote,
    "Description"
  );
  const descriptionHtml = await renderMarkdown(descriptionMarkdown);

  await prisma.$transaction(async (tx) => {
    const current = await tx.siteImprovement.findUnique({
      where: { id: improvementId },
      select: { id: true, creatorId: true, title: true, descriptionMarkdown: true }
    });
    if (!current) throw new Error("Site improvement not found.");
    if (current.creatorId !== user.id && !canUseAdminTools(user)) {
      throw new Error("Only the creator or an admin can edit this improvement.");
    }
    if (current.title === title && current.descriptionMarkdown === descriptionMarkdown) return;
    await tx.siteImprovement.update({
      where: { id: current.id },
      data: { title, descriptionMarkdown, descriptionHtml }
    });
    await tx.siteImprovementActivity.create({
      data: {
        improvementId: current.id,
        actorId: user.id,
        type: SiteImprovementActivityType.DETAILS_CHANGED
      }
    });
  });

  revalidateImprovement(improvementId);
}

export async function updateSiteImprovementMetadataAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:metadata:${user.id}`, 60, 60_000);
  const status = parseSiteImprovementStatus(formData.get("status"));
  const priority = parseSiteImprovementPriority(formData.get("priority"));

  await prisma.$transaction(async (tx) => {
    const current = await tx.siteImprovement.findUnique({
      where: { id: improvementId },
      select: {
        id: true,
        title: true,
        creatorId: true,
        status: true,
        priority: true,
        completionReviews: {
          where: { status: SiteImprovementCompletionReviewStatus.PENDING },
          select: { id: true, notificationId: true }
        }
      }
    });
    if (!current) throw new Error("Site improvement not found.");
    const statusChanged = current.status !== status;
    const priorityChanged = current.priority !== priority;
    if (statusChanged && !canUseOwnerTools(user)) {
      throw new Error("Only the owner can change a site improvement status.");
    }
    if (!statusChanged && !priorityChanged) return;

    const now = new Date();
    const updated = await tx.siteImprovement.updateMany({
      where: { id: current.id, status: current.status, priority: current.priority },
      data: {
        ...(statusChanged
          ? { status, completedAt: status === SiteImprovementStatus.COMPLETED ? now : null }
          : {}),
        ...(priorityChanged ? { priority } : {})
      }
    });
    if (updated.count !== 1) throw new Error("This improvement changed while you were updating it.");

    if (statusChanged && current.completionReviews.length > 0) {
      const pendingReviewIds = current.completionReviews.map((review) => review.id);
      const pendingNotificationIds = current.completionReviews
        .map((review) => review.notificationId)
        .filter((notificationId): notificationId is number => notificationId !== null);
      await tx.siteImprovementCompletionReview.updateMany({
        where: { id: { in: pendingReviewIds }, status: SiteImprovementCompletionReviewStatus.PENDING },
        data: { status: SiteImprovementCompletionReviewStatus.INVALIDATED, respondedAt: now }
      });
      if (pendingNotificationIds.length > 0) {
        await tx.notification.updateMany({
          where: { id: { in: pendingNotificationIds }, readAt: null },
          data: { readAt: now }
        });
      }
    }

    if (
      statusChanged &&
      status === SiteImprovementStatus.COMPLETED &&
      current.creatorId
    ) {
      const notification = await tx.notification.create({
        data: {
          userId: current.creatorId,
          actorId: user.id,
          type: NotificationType.SITE_IMPROVEMENT_COMPLETED,
          title: "Your suggestion has been implemented",
          body: `"${current.title}" is ready to test. Please check that it works as expected, then confirm when you are satisfied.`,
          href: improvementPath(current.id)
        }
      });
      await tx.siteImprovementCompletionReview.create({
        data: {
          improvementId: current.id,
          notificationId: notification.id
        }
      });
    }

    await tx.siteImprovementActivity.createMany({
      data: [
        ...(statusChanged
          ? [{
              improvementId: current.id,
              actorId: user.id,
              type: SiteImprovementActivityType.STATUS_CHANGED,
              fromValue: current.status,
              toValue: status
            }]
          : []),
        ...(priorityChanged
          ? [{
              improvementId: current.id,
              actorId: user.id,
              type: SiteImprovementActivityType.PRIORITY_CHANGED,
              fromValue: current.priority,
              toValue: priority
            }]
          : [])
      ]
    });
  });

  revalidateImprovement(improvementId);
  revalidatePath("/", "layout");
}

export async function deleteSiteImprovementAction(improvementId: number) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:delete:${user.id}`, 20, 60_000);

  await prisma.$transaction(async (tx) => {
    const improvement = await tx.siteImprovement.findUnique({
      where: { id: improvementId },
      select: {
        id: true,
        creatorId: true,
        completionReviews: { select: { notificationId: true } }
      }
    });
    if (!improvement) throw new Error("Site improvement not found.");
    if (improvement.creatorId !== user.id && !canUseAdminTools(user)) {
      throw new Error("Only the creator or an admin can delete this improvement.");
    }

    const notificationIds = improvement.completionReviews
      .map((review) => review.notificationId)
      .filter((notificationId): notificationId is number => notificationId !== null);
    if (notificationIds.length > 0) {
      await tx.notification.deleteMany({ where: { id: { in: notificationIds } } });
    }
    await tx.siteImprovement.delete({ where: { id: improvement.id } });
  });

  revalidatePath(BOARD_PATH);
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  redirect(BOARD_PATH);
}

type SiteImprovementCompletionResponse = "confirm" | "follow-up";

export async function respondToSiteImprovementCompletionAction(
  reviewId: number,
  response: SiteImprovementCompletionResponse,
  _formData: FormData
) {
  const user = await requireUser();
  await assertRateLimit(`site-improvement:completion-response:${user.id}`, 20, 60_000);
  if (!Number.isInteger(reviewId) || reviewId <= 0) throw new Error("Invalid completion review.");
  if (response !== "confirm" && response !== "follow-up") throw new Error("Invalid completion response.");

  const result = await prisma.$transaction(async (tx) => {
    const review = await tx.siteImprovementCompletionReview.findUnique({
      where: { id: reviewId },
      include: { improvement: { select: { id: true, creatorId: true } } }
    });
    if (!review) throw new Error("Completion review not found.");
    if (review.improvement.creatorId !== user.id) {
      throw new Error("Only the suggestion author can answer this review.");
    }
    if (review.status !== SiteImprovementCompletionReviewStatus.PENDING) {
      return { status: review.status, improvementId: review.improvement.id };
    }

    const now = new Date();
    const status = response === "confirm"
      ? SiteImprovementCompletionReviewStatus.CONFIRMED
      : SiteImprovementCompletionReviewStatus.FOLLOW_UP;
    await tx.siteImprovementCompletionReview.update({
      where: { id: review.id },
      data: { status, respondedAt: now }
    });
    if (review.notificationId) {
      await tx.notification.updateMany({
        where: { id: review.notificationId, userId: user.id, readAt: null },
        data: { readAt: now }
      });
    }
    return { status, improvementId: review.improvement.id };
  });

  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  revalidateImprovement(result.improvementId);
  if (result.status === SiteImprovementCompletionReviewStatus.FOLLOW_UP) {
    redirect(`${BOARD_PATH}?new=1#new-site-improvement` as Route);
  }
  redirect(`/notifications?siteImprovementReview=${result.status.toLowerCase()}#site-improvement-review-${reviewId}`);
}

export async function createSiteImprovementCommentAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:comment:${user.id}`, 20, 60_000);
  const bodyMarkdown = requiredBoundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.discussionPost,
    "Discussion message"
  );
  const improvement = await prisma.siteImprovement.findUnique({
    where: { id: improvementId },
    select: { id: true }
  });
  if (!improvement) throw new Error("Site improvement not found.");

  const comment = await prisma.siteImprovementComment.create({
    data: {
      improvementId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdown(bodyMarkdown)
    }
  });
  revalidateImprovement(improvementId);
  redirect(`${improvementPath(improvementId)}#comment-${comment.id}` as Route);
}
