import { prisma } from "@/lib/db";

export const ANNOUNCEMENT_BADGE_CAP = 99;

export async function unreadAnnouncementCount(user: { lastSeenAnnouncementAt: Date | null }) {
  return prisma.announcement.count({
    where: user.lastSeenAnnouncementAt ? { createdAt: { gt: user.lastSeenAnnouncementAt } } : {}
  });
}

export function cappedAnnouncementCount(count: number) {
  return Math.min(count, ANNOUNCEMENT_BADGE_CAP);
}

export async function markAnnouncementsSeen(userId: number) {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAnnouncementAt: new Date() } });
}
