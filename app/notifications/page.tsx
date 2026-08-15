import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { UserAvatar } from "@/components/UserAvatar";
import { clearNotificationsAction } from "@/lib/actions/notification-actions";
import { requireUser } from "@/lib/auth";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";
import { getTranslations } from "@/lib/i18n/server";
import { cleanupNotificationsForUser, notificationOpenHref } from "@/lib/notification-lifecycle";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const timeZone = await getRequestTimeZone();
  await cleanupNotificationsForUser(user.id);
  const hiddenNotificationTypes = EXPLORATIONS_ENABLED
    ? [NotificationType.CHAT_MESSAGE]
    : [NotificationType.CHAT_MESSAGE, NotificationType.EXPLORATION_PUBLISHED];
  const [unreadNotifications, readNotifications] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, readAt: null, type: { notIn: hiddenNotificationTypes } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: {
          select: { username: true, displayName: true, avatarUrl: true, avatarBackground: true }
        }
      }
    }),
    prisma.notification.findMany({
      where: { userId: user.id, readAt: { not: null }, type: { notIn: hiddenNotificationTypes } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: {
          select: { username: true, displayName: true, avatarUrl: true, avatarBackground: true }
        }
      }
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
            <div className="notification-item-main">
              {notification.actor && <UserAvatar user={notification.actor} size="sm" />}
              <div>
                <span>
                  <strong><AsyncMarkdownInline markdown={notification.title} /></strong>
                  <small>{formatUserShortDateTime(notification.createdAt, timeZone)}</small>
                </span>
                <p><AsyncMarkdownInline markdown={notification.body} /></p>
              </div>
            </div>
          </Link>
        ))}
        {notifications.length === 0 && <p className="empty-state">{t.notifications.noNotifications}</p>}
      </div>
    </ForestPageLayout>
  );
}
