export const ANNOUNCEMENT_BADGE_CAP = 99;

export type AnnouncementReader = {
  createdAt: Date;
  lastSeenAnnouncementAt: Date | null;
};

export function announcementUnreadSince(user: AnnouncementReader) {
  return user.lastSeenAnnouncementAt && user.lastSeenAnnouncementAt > user.createdAt
    ? user.lastSeenAnnouncementAt
    : user.createdAt;
}

export function cappedAnnouncementCount(count: number) {
  return Math.min(count, ANNOUNCEMENT_BADGE_CAP);
}
