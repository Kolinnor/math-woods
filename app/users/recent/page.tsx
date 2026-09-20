import Link from "next/link";
import { NotificationType } from "@prisma/client";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { UserAvatar } from "@/components/UserAvatar";
import { requireModerator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { avatarAchievementFromStats, contestAchievementStatsByUser } from "@/lib/problem-contests";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import { displayNameForUser } from "@/lib/user-display";
import {
  RECENT_USER_REGISTRATION_DAYS,
  USER_REGISTRATION_SUMMARY_HREF
} from "@/lib/user-registration-summary";
import { profilePath } from "@/lib/usernames";

export const dynamic = "force-dynamic";

export default async function RecentUsersPage() {
  const user = await requireModerator();
  const [t, interfaceLocale, timeZone] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getRequestTimeZone()
  ]);
  const registeredSince = new Date(Date.now() - RECENT_USER_REGISTRATION_DAYS * 24 * 60 * 60 * 1000);
  const recentUsers = await prisma.user.findMany({
    where: {
      createdAt: { gte: registeredSince },
      deletedAt: null
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      profileSlug: true,
      displayName: true,
      avatarUrl: true,
      avatarBackground: true,
      createdAt: true
    }
  });
  await markNotificationsReadForHref(
    user.id,
    USER_REGISTRATION_SUMMARY_HREF,
    NotificationType.USER_REGISTERED
  );
  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? "UTC"
  });
  const recentUserContestSubmissions = recentUsers.length
    ? await prisma.problemContestSubmission.findMany({
        where: { userId: { in: recentUsers.map((recentUser) => recentUser.id) }, placement: { not: null } },
        select: { userId: true, placement: true }
      })
    : [];
  const achievementsByUserId = contestAchievementStatsByUser(recentUserContestSubmissions);

  return (
    <ForestPageLayout
      title={t.users.recentRegistrations.title}
      eyebrow={t.users.recentRegistrations.eyebrow}
      heroImage="/art/users-forest.webp"
      heroAlt="Ivan Shishkin, The Forest Clearing"
      description={t.users.recentRegistrations.description}
      meta={<p>{t.users.recentRegistrations.count(recentUsers.length)}</p>}
    >
      <div className="list-surface recent-users-list">
        {recentUsers.map((recentUser) => {
          const achievement = avatarAchievementFromStats(achievementsByUserId.get(recentUser.id), t.contestAchievements);
          return (
            <Link
              key={recentUser.id}
              href={`${profilePath(recentUser)}${achievement ? "#palmares" : ""}` as never}
              className="list-row recent-user-row"
            >
              <UserAvatar user={recentUser} size="lg" achievement={achievement} />
              <span className="recent-user-main">
                <strong>{displayNameForUser(recentUser)}</strong>
                <small>{t.users.recentRegistrations.joined(dateFormatter.format(recentUser.createdAt))}</small>
              </span>
            </Link>
          );
        })}
        {recentUsers.length === 0 && (
          <p className="empty-state">{t.users.recentRegistrations.empty}</p>
        )}
      </div>
    </ForestPageLayout>
  );
}
