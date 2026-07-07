import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { clearNotificationsAction } from "@/lib/actions/notification-actions";
import { requireUser } from "@/lib/auth";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const timeZone = await getRequestTimeZone();
  const [unreadNotifications, readNotifications] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.notification.findMany({
      where: { userId: user.id, readAt: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);
  const notifications = [...unreadNotifications, ...readNotifications].slice(0, 100);

  return (
    <ForestPageLayout
      title="Notifications"
      eyebrow="Inbox"
      heroImage="/art/forest-road.jpg"
      heroAlt="Ivan Shishkin, Road in a Forest"
      description="Recent updates from problems, concepts, discussions, and site activity."
      meta={
        <>
          <p>{notifications.length} shown</p>
          <p>{unreadNotifications.length} unread</p>
        </>
      }
      actions={
        notifications.length > 0 && (
          <form action={clearNotificationsAction}>
            <button type="submit" className="danger">
              <Trash2 size={16} />
              Clear notifications
            </button>
          </form>
        )
      }
    >
      <div className="list-surface notification-page-list">
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
        {notifications.length === 0 && <p className="empty-state">No notifications yet.</p>}
      </div>
    </ForestPageLayout>
  );
}
