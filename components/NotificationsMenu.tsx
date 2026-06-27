import Link from "next/link";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { clearReadNotificationsAction, markAllNotificationsReadAction } from "@/lib/actions/notification-actions";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export async function NotificationsMenu({ userId }: { userId: number }) {
  const timeZone = await getRequestTimeZone();
  const [notifications, unreadCount, readCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { username: true } } }
    }),
    prisma.notification.count({
      where: { userId, readAt: null }
    }),
    prisma.notification.count({
      where: { userId, readAt: { not: null } }
    })
  ]);

  return (
    <details className="notification-menu">
      <summary aria-label="Open notifications" title="Notifications">
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 99)}</span>}
      </summary>
      <div className="notification-popover">
        <div className="notification-header">
          <strong>Notifications</strong>
          <div className="notification-actions">
            {unreadCount > 0 && (
              <form action={markAllNotificationsReadAction}>
                <button type="submit" className="notification-read-button">
                  <CheckCheck size={15} />
                  Mark all read
                </button>
              </form>
            )}
            {readCount > 0 && (
              <form action={clearReadNotificationsAction}>
                <button type="submit" className="notification-read-button">
                  <Trash2 size={15} />
                  Clear read
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
