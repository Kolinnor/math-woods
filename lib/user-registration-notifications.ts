import { NotificationType, Prisma, Role } from "@prisma/client";
import { prisma } from "./db.ts";
import {
  USER_REGISTRATION_SUMMARY_HREF,
  USER_REGISTRATION_SUMMARY_KEY,
  USER_REGISTRATION_SUMMARY_WINDOW_HOURS,
  userRegistrationSummaryCopy
} from "./user-registration-summary.ts";

type RegistrationNotificationClient = Pick<Prisma.TransactionClient, "notification" | "user">;

export async function notifyTrustedUsersOfRegistration(
  db: RegistrationNotificationClient = prisma,
  now = new Date(),
  revalidate = true
) {
  const recentSince = new Date(now.getTime() - USER_REGISTRATION_SUMMARY_WINDOW_HOURS * 60 * 60 * 1000);
  const [recentRegistrationCount, recipients] = await Promise.all([
    db.user.count({
      where: {
        createdAt: { gte: recentSince },
        deletedAt: null
      }
    }),
    db.user.findMany({
      where: {
        role: { in: [Role.MODERATOR, Role.ADMIN, Role.OWNER] },
        deletedAt: null,
        notificationPreferences: {
          none: {
            type: NotificationType.USER_REGISTERED,
            enabled: false
          }
        }
      },
      select: { id: true }
    })
  ]);
  const copy = userRegistrationSummaryCopy("en", recentRegistrationCount);

  await Promise.all(
    recipients.map(({ id: userId }) =>
      db.notification.upsert({
        where: {
          userId_type_aggregationKey: {
            userId,
            type: NotificationType.USER_REGISTERED,
            aggregationKey: USER_REGISTRATION_SUMMARY_KEY
          }
        },
        update: {
          actorId: null,
          title: copy.title,
          body: copy.body,
          href: USER_REGISTRATION_SUMMARY_HREF,
          readAt: null,
          dismissedFromMenuAt: null,
          createdAt: now
        },
        create: {
          userId,
          actorId: null,
          type: NotificationType.USER_REGISTERED,
          aggregationKey: USER_REGISTRATION_SUMMARY_KEY,
          title: copy.title,
          body: copy.body,
          href: USER_REGISTRATION_SUMMARY_HREF,
          createdAt: now
        }
      })
    )
  );

  if (revalidate) {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/", "layout");
  }
  return { recentRegistrationCount, recipientCount: recipients.length };
}
