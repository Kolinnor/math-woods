import { NotificationType, TrustedUserRecommendationStatus } from "@prisma/client";
import Link from "next/link";
import { Check, Trash2, X } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { UserAvatar } from "@/components/UserAvatar";
import { localizeAchievementNotification } from "@/lib/achievement-copy";
import { clearNotificationsAction } from "@/lib/actions/notification-actions";
import { decideTrustedUserRecommendationAction } from "@/lib/actions/trusted-user-actions";
import { requireUser } from "@/lib/auth";
import { formatUserShortDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { cleanupNotificationsForUser, notificationOpenHref } from "@/lib/notification-lifecycle";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const [t, interfaceLocale, timeZone] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getRequestTimeZone()
  ]);
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
          select: { username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true }
        },
        trustedUserReview: { select: { id: true, status: true } }
      }
    }),
    prisma.notification.findMany({
      where: { userId: user.id, readAt: { not: null }, type: { notIn: hiddenNotificationTypes } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: {
          select: { username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true }
        },
        trustedUserReview: { select: { id: true, status: true } }
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
        {notifications.map((notification) => {
          const localizedNotification = localizeAchievementNotification(notification, interfaceLocale);
          const content = (
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
          );
          const recommendation = notification.trustedUserReview;
          const className = notification.readAt ? "notification-item" : "notification-item notification-unread";

          if (!recommendation) {
            return (
              <Link
                key={notification.id}
                href={notificationOpenHref(notification.id) as never}
                className={className}
              >
                {content}
              </Link>
            );
          }

          return (
            <article
              key={notification.id}
              id={`trusted-user-review-${recommendation.id}`}
              className={`${className} notification-action-item`}
            >
              {content}
              {notification.actor && (
                <Link href={`/profile/${notification.actor.profileSlug}`} className="notification-review-profile-link">
                  {t.notifications.trustedUserReview.viewProfile}
                </Link>
              )}
              {recommendation.status === TrustedUserRecommendationStatus.PENDING ? (
                <div className="notification-decision-actions">
                  <form action={decideTrustedUserRecommendationAction.bind(null, recommendation.id, "approve")}>
                    <button type="submit" className="primary">
                      <Check size={16} aria-hidden="true" />
                      {t.notifications.trustedUserReview.approve}
                    </button>
                  </form>
                  <form action={decideTrustedUserRecommendationAction.bind(null, recommendation.id, "decline")}>
                    <button type="submit" className="secondary">
                      <X size={16} aria-hidden="true" />
                      {t.notifications.trustedUserReview.decline}
                    </button>
                  </form>
                </div>
              ) : (
                <p className="notification-decision-status">
                  {t.notifications.trustedUserReview.status[recommendation.status]}
                </p>
              )}
            </article>
          );
        })}
        {notifications.length === 0 && <p className="empty-state">{t.notifications.noNotifications}</p>}
      </div>
    </ForestPageLayout>
  );
}
