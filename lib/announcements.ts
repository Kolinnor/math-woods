import { prisma } from "@/lib/db";
import {
  announcementUnreadSince,
  type AnnouncementReader
} from "@/lib/announcement-read-state";

export {
  ANNOUNCEMENT_BADGE_CAP,
  announcementUnreadSince,
  cappedAnnouncementCount
} from "@/lib/announcement-read-state";

export async function unreadAnnouncementCount(user: AnnouncementReader) {
  return prisma.announcement.count({
    where: { createdAt: { gt: announcementUnreadSince(user) } }
  });
}
