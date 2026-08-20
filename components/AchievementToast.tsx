import { AchievementToastClient } from "@/components/AchievementToastClient";
import {
  dismissAchievementLabel,
  localizeAchievementNotification
} from "@/lib/achievement-copy";
import { markNotificationReadAction } from "@/lib/actions/notification-actions";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";

export async function AchievementToast({ userId }: { userId: number }) {
  const notification = await prisma.notification.findFirst({
    where: {
      userId,
      type: "ACHIEVEMENT_UNLOCKED",
      readAt: null
    },
    orderBy: { createdAt: "desc" }
  });

  if (!notification) return null;
  const locale = await getInterfaceLocale();
  const localized = localizeAchievementNotification(notification, locale);

  return (
    <AchievementToastClient
      notificationId={notification.id}
      href={notification.href}
      label={localized.title}
      body={localized.body}
      dismissLabel={dismissAchievementLabel(locale)}
      dismissAction={markNotificationReadAction}
    />
  );
}
