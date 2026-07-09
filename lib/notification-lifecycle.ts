import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

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

  await prisma.notification.deleteMany({
    where: {
      userId,
      OR: [
        { readAt: { lt: readBefore } },
        { createdAt: { lt: anyBefore } }
      ]
    }
  });
}
