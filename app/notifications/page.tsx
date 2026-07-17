import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { clearNotificationsAction } from "@/lib/actions/notification-actions";
import { requireUser } from "@/lib/auth";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { cleanupNotificationsForUser, notificationOpenHref } from "@/lib/notification-lifecycle";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const timeZone = await getRequestTimeZone();
  await cleanupNotificationsForUser(user.id);
  const [unreadNotifications, readNotifications] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, readAt: null, type: { not: NotificationType.CHAT_MESSAGE } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.notification.findMany({
      where: { userId: user.id, readAt: { not: null }, type: { not: NotificationType.CHAT_MESSAGE } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);
  const notifications = [...unreadNotifications, ...readNotifications].slice(0, 100);

  return (
    <ForestPageLayout
      title={t.notifications.title}
      eyebrow={t.notifications.inbox}
      heroImage="/art/forest-road.jpg"
      heroAlt="Ivan Shishkin, Road in a Forest"
      description={t.notifications.description}
      meta={
        <>
          <p>{t.notifications.shown(notifications.length)}</p>
          <p>{t.notifications.unread(unreadNotifications.length)}</p>
        </>
      }
      actions={
        notifications.length > 0 && (
          <form action={clearNotificationsAction}>
            <button type="submit" className="danger">
              <Trash2 size={16} />
              {t.notifications.clear}
            </button>
          </form>
        )
      }
    >
      <div className="list-surface notification-page-list">
        {notifications.map((notification) => (
          <Link
            key={notification.id}
            href={notificationOpenHref(notification.id) as never}
            className={notification.readAt ? "notification-item" : "notification-item notification-unread"}
          >
            <span>
              <strong>{notification.title}</strong>
              <small>{formatUserShortDateTime(notification.createdAt, timeZone)}</small>
            </span>
            <p>{notification.body}</p>
          </Link>
        ))}
        {notifications.length === 0 && <p className="empty-state">{t.notifications.noNotifications}</p>}
      </div>
    </ForestPageLayout>
  );
}
