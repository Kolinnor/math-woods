import {
  NotificationType,
  SiteImprovementCompletionReviewStatus,
  SiteImprovementStatus,
  TrustedUserRecommendationStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { RETIRED_LIBRARY_NOTIFICATION_TYPES } from "@/lib/notification-policy";

const READ_NOTIFICATION_RETENTION_DAYS = 14;
const ANY_NOTIFICATION_RETENTION_DAYS = 120;

export function safeNotificationHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return "/notifications";
  return href;
}

export function notificationOpenHref(notificationId: number) {
  return `/notifications/open/${notificationId}`;
}

export async function markNotificationRead(userId: number, notificationId: number) {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      readAt: null
    },
    data: { readAt: new Date() }
  });

  revalidatePath("/", "layout");
  revalidatePath("/notifications");
}

export async function markNotificationsReadForHref(
  userId: number,
  href: string,
  type?: NotificationType | NotificationType[],
  options: { revalidate?: boolean } = {}
) {
  const typeFilter: NotificationType | { in: NotificationType[] } | undefined = type
    ? Array.isArray(type)
      ? { in: [...type] }
      : type
    : undefined;

  await prisma.notification.updateMany({
    where: {
      userId,
      href,
      readAt: null,
      ...(typeFilter ? { type: typeFilter } : {})
    },
    data: { readAt: new Date() }
  });

  if (options.revalidate) {
    revalidatePath("/", "layout");
    revalidatePath("/notifications");
  }
}

export async function clearFriendRequestNotifications(userId: number, actorId: number) {
  await prisma.notification.deleteMany({
    where: {
      userId,
      actorId,
      type: NotificationType.FRIEND_REQUEST,
      href: "/friends"
    }
  });

  revalidatePath("/", "layout");
  revalidatePath("/notifications");
}

export async function cleanupNotificationsForUser(userId: number) {
  const now = Date.now();
  const readBefore = new Date(now - READ_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const anyBefore = new Date(now - ANY_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Only query the board for users who actually have a reminder to clean up.
  // This also removes reminders created before the zero-count delivery guard.
  const improvementReminder = await prisma.notification.findFirst({
    where: { userId, type: NotificationType.SITE_IMPROVEMENT_REMINDER },
    select: { id: true }
  });
  const clearImprovementReminders = improvementReminder !== null &&
    await prisma.siteImprovement.count({
      where: { status: { not: SiteImprovementStatus.COMPLETED } }
    }) === 0;

  await prisma.notification.deleteMany({
    where: {
      userId,
      NOT: [
        { trustedUserReview: { is: { status: TrustedUserRecommendationStatus.PENDING } } },
        { siteImprovementReview: { is: { status: SiteImprovementCompletionReviewStatus.PENDING } } }
      ],
      OR: [
        { type: { in: RETIRED_LIBRARY_NOTIFICATION_TYPES } },
        ...(clearImprovementReminders ? [{ type: NotificationType.SITE_IMPROVEMENT_REMINDER }] : []),
        { readAt: { lt: readBefore } },
        { createdAt: { lt: anyBefore } }
      ]
    }
  });
}
