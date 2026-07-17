import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { clearNotificationsAction } from "@/lib/actions/notification-actions";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { cleanupNotificationsForUser, notificationOpenHref } from "@/lib/notification-lifecycle";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export async function NotificationsMenu({ userId }: { userId: number }) {
  const t = await getTranslations();
  const timeZone = await getRequestTimeZone();
  await cleanupNotificationsForUser(userId);
  const [unreadNotifications, unreadCount, notificationCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, readAt: null, type: { not: NotificationType.CHAT_MESSAGE } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { username: true } } }
    }),
    prisma.notification.count({
      where: { userId, readAt: null, type: { not: NotificationType.CHAT_MESSAGE } }
    }),
    prisma.notification.count({
      where: { userId, type: { not: NotificationType.CHAT_MESSAGE } }
    })
  ]);

  return (
    <AutoClosingDetails className="notification-menu">
      <summary aria-label={t.notifications.openMenu} title={t.notifications.title}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 99)}</span>}
      </summary>
      <div className="notification-popover">
        <div className="notification-header">
          <Link href={"/notifications" as never} className="notification-title-link">
            {t.notifications.title}
          </Link>
          <div className="notification-actions">
            {notificationCount > 0 && (
              <form action={clearNotificationsAction}>
                <button type="submit" className="notification-clear-button">
                  <Trash2 size={15} />
                  {t.notifications.clear}
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="notification-list">
          {unreadNotifications.map((notification) => (
            <Link
              key={notification.id}
              href={notificationOpenHref(notification.id) as never}
              className="notification-item notification-unread"
            >
              <span>
                <strong>{notification.title}</strong>
                <small>{formatUserShortDateTime(notification.createdAt, timeZone)}</small>
              </span>
              <p>{notification.body}</p>
            </Link>
          ))}
          {unreadNotifications.length === 0 && <p className="notification-empty">{t.notifications.noUnread}</p>}
        </div>
      </div>
    </AutoClosingDetails>
  );
}
