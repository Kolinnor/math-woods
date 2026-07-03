"use server";

import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

const configurableNotificationTypes = [
  NotificationType.PROBLEM_SOLVED,
  NotificationType.PROBLEM_EDITED,
  NotificationType.PROOF_ADDED,
  NotificationType.DISCUSSION_POSTED,
  NotificationType.ACHIEVEMENT_UNLOCKED,
  NotificationType.VERIFICATION_REQUESTED,
  NotificationType.VERIFICATION_MESSAGE,
  NotificationType.VERIFICATION_APPROVED,
  NotificationType.VERIFICATION_REJECTED,
  NotificationType.SITE_ERROR_REPORTED,
  NotificationType.USER_REGISTERED,
  NotificationType.PROBLEM_CREATED,
  NotificationType.CONCEPT_CREATED,
  NotificationType.CONCEPT_EDITED
] as const;

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await assertRateLimit(`notifications:${user.id}`, 60, 60_000);

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null
    },
    data: { readAt: new Date() }
  });

  revalidatePath("/", "layout");
}

export async function markNotificationReadAction(notificationId: number) {
  const user = await requireUser();
  await assertRateLimit(`notification-read:${user.id}`, 120, 60_000);

  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId: user.id,
      readAt: null
    },
    data: { readAt: new Date() }
  });

  revalidatePath("/", "layout");
}

export async function clearReadNotificationsAction() {
  const user = await requireUser();
  await assertRateLimit(`notifications-clear:${user.id}`, 20, 60_000);

  await prisma.notification.deleteMany({
    where: {
      userId: user.id,
      readAt: { not: null }
    }
  });

  revalidatePath("/", "layout");
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`notification-preferences:${user.id}`, 20, 60_000);
  const enabledTypes = new Set(formData.getAll("enabledTypes").map(String));

  await prisma.$transaction(
    configurableNotificationTypes.map((type) =>
      prisma.notificationPreference.upsert({
        where: {
          userId_type: {
            userId: user.id,
            type
          }
        },
        update: { enabled: enabledTypes.has(type) },
        create: {
          userId: user.id,
          type,
          enabled: enabledTypes.has(type)
        }
      })
    )
  );

  revalidatePath("/settings");
  redirect("/settings?tab=notifications&updated=notifications");
}
