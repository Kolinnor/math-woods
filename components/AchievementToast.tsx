import { AchievementToastClient } from "@/components/AchievementToastClient";
import { markNotificationReadAction } from "@/lib/actions/notification-actions";
import { prisma } from "@/lib/db";

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

  return (
    <AchievementToastClient
      notificationId={notification.id}
      href={notification.href}
      body={notification.body}
      dismissAction={markNotificationReadAction}
    />
  );
}
