import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { Bell, Trash2, X } from "lucide-react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { UserAvatar } from "@/components/UserAvatar";
import { clearNotificationMenuAction } from "@/lib/actions/notification-actions";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { localizeNotification } from "@/lib/notification-copy";
import { cleanupNotificationsForUser, notificationOpenHref } from "@/lib/notification-lifecycle";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import {
  USER_REGISTRATION_SUMMARY_KEY,
  USER_REGISTRATION_SUMMARY_WINDOW_HOURS
} from "@/lib/user-registration-summary";

export async function NotificationsMenu({ userId }: { userId: number }) {
  const [t, interfaceLocale, timeZone] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getRequestTimeZone()
  ]);
  await cleanupNotificationsForUser(userId);
  const hiddenNotificationTypes = EXPLORATIONS_ENABLED
    ? [NotificationType.CHAT_MESSAGE]
    : [NotificationType.CHAT_MESSAGE, NotificationType.EXPLORATION_PUBLISHED];
  const [unreadNotifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, readAt: null, dismissedFromMenuAt: null, type: { notIn: hiddenNotificationTypes } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        actor: {
          select: { username: true, displayName: true, avatarUrl: true, avatarBackground: true }
        },
        siteImprovementReview: {
          select: { improvement: { select: { title: true } } }
        }
      }
    }),
    prisma.notification.count({
      where: { userId, readAt: null, dismissedFromMenuAt: null, type: { notIn: hiddenNotificationTypes } }
    })
  ]);
  const hasRegistrationSummary = unreadNotifications.some(
    (notification) => notification.aggregationKey === USER_REGISTRATION_SUMMARY_KEY
  );
  const recentRegistrationCount = hasRegistrationSummary
    ? await prisma.user.count({
        where: {
          createdAt: { gte: new Date(Date.now() - USER_REGISTRATION_SUMMARY_WINDOW_HOURS * 60 * 60 * 1000) },
          deletedAt: null
        }
      })
    : undefined;

  return (
    <AutoClosingDetails className="notification-menu">
      <summary aria-label={t.notifications.openMenu} title={t.notifications.title}>
        <Bell size={20} />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 99)}</span>}
      </summary>
      <div className="notification-popover">
        <div className="notification-header">
          <Link href={"/notifications" as never} className="notification-title-link">
            {t.notifications.title}
          </Link>
          <div className="notification-actions">
            {unreadCount > 0 && (
              <form action={clearNotificationMenuAction}>
                <button type="submit" className="notification-clear-button">
                  <Trash2 size={15} />
                  {t.notifications.clear}
                </button>
              </form>
            )}
            <button
              type="button"
              className="notification-close-button"
              data-close-details
              aria-label={t.notifications.closeMenu}
              title={t.notifications.closeMenu}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="notification-list">
          {unreadNotifications.map((notification) => {
            const localizedNotification = localizeNotification(notification, interfaceLocale, {
              recentRegistrationCount
            });
            return (
              <Link
                key={notification.id}
                href={notificationOpenHref(notification.id) as never}
                className="notification-item notification-unread"
              >
                <div className="notification-item-main">
                  {notification.actor && <UserAvatar user={notification.actor} size="sm" />}
                  <div>
                    <span>
                      <strong><AsyncMarkdownInline markdown={localizedNotification.title} /></strong>
                      <small>{formatUserShortDateTime(notification.createdAt, timeZone)}</small>
                    </span>
                    <p><AsyncMarkdownInline markdown={localizedNotification.body} /></p>
                  </div>
                </div>
              </Link>
            );
          })}
          {unreadNotifications.length === 0 && <p className="notification-empty">{t.notifications.noUnread}</p>}
        </div>
      </div>
    </AutoClosingDetails>
  );
}
