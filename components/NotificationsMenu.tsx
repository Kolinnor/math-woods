import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import { clearNotificationsAction } from "@/lib/actions/notification-actions";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export async function NotificationsMenu({ userId }: { userId: number }) {
  const timeZone = await getRequestTimeZone();
  const [unreadNotifications, unreadCount, notificationCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { username: true } } }
    }),
    prisma.notification.count({
      where: { userId, readAt: null }
    }),
    prisma.notification.count({
      where: { userId }
    })
  ]);
  const readNotifications =
    unreadNotifications.length < 8
      ? await prisma.notification.findMany({
          where: { userId, readAt: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 8 - unreadNotifications.length,
          include: { actor: { select: { username: true } } }
        })
      : [];
  const notifications = [...unreadNotifications, ...readNotifications];

  return (
    <details className="notification-menu">
      <summary aria-label="Open notifications" title="Notifications">
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 99)}</span>}
      </summary>
      <div className="notification-popover">
        <div className="notification-header">
          <Link href={"/notifications" as never} className="notification-title-link">
            Notifications
          </Link>
          <div className="notification-actions">
            {notificationCount > 0 && (
              <form action={clearNotificationsAction}>
                <button type="submit" className="notification-clear-button">
                  <Trash2 size={15} />
                  Clear notifications
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="notification-list">
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href={notification.href as never}
              className={notification.readAt ? "notification-item" : "notification-item notification-unread"}
            >
              <span>
                <strong>{notification.title}</strong>
                <small>{formatUserShortDateTime(notification.createdAt, timeZone)}</small>
              </span>
              <p>{notification.body}</p>
            </Link>
          ))}
          {notifications.length === 0 && <p className="notification-empty">No notifications yet.</p>}
        </div>
      </div>
    </details>
  );
}
