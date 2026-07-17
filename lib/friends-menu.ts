import { FriendshipStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { displayNameForUser } from "@/lib/user-display";

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export type FriendsMenuData = {
  actionCount: number;
  currentUserId: number;
  incomingCount: number;
  friends: Array<{
    id: number;
    name: string;
    online: boolean;
    username: string;
  }>;
  unreadChatCount: number;
  labels: {
    friends: string;
    backToFriends: string;
    noFriendsYet: string;
    noMessagesYet: string;
    offline: string;
    online: string;
    onlineShort: string;
    openFullChat: string;
    pendingRequests: string | null;
    send: string;
    sending: string;
    unreadMessages: string | null;
    writeMessage: string;
  };
};

export async function friendsMenuDataForUser(userId: number): Promise<FriendsMenuData> {
  const t = await getTranslations();
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const [friendships, incomingCount, unreadChatCount] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { addresseeId: userId }]
      },
      include: {
        requester: { select: { id: true, username: true, displayName: true } },
        addressee: { select: { id: true, username: true, displayName: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.friendship.count({
      where: {
        addresseeId: userId,
        status: FriendshipStatus.PENDING
      }
    }),
    prisma.notification.count({
      where: {
        userId,
        readAt: null,
        type: NotificationType.CHAT_MESSAGE
      }
    })
  ]);
  const friendIds = friendships.map((friendship) =>
    friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId
  );
  const onlineSessions = friendIds.length
    ? await prisma.session.findMany({
        where: {
          userId: { in: friendIds },
          lastSeenAt: { gte: onlineSince },
          expiresAt: { gt: now }
        },
        distinct: ["userId"],
        select: { userId: true }
      })
    : [];
  const onlineIds = new Set(onlineSessions.map((session) => session.userId));
  const friends = friendships
    .map((friendship) => (friendship.requesterId === userId ? friendship.addressee : friendship.requester))
    .map((friend) => ({
      id: friend.id,
      name: displayNameForUser(friend),
      online: onlineIds.has(friend.id),
      username: friend.username
    }))
    .sort((left, right) => Number(right.online) - Number(left.online) || left.name.localeCompare(right.name));
  const onlineCount = friends.filter((friend) => friend.online).length;
  const actionCount = incomingCount + unreadChatCount;

  return {
    actionCount,
    currentUserId: userId,
    incomingCount,
    friends,
    unreadChatCount,
    labels: {
      friends: t.social.friends,
      backToFriends: t.social.backToFriends,
      noFriendsYet: t.social.noFriendsYet,
      noMessagesYet: t.social.noMessagesYet,
      offline: t.social.offline,
      online: t.social.online,
      onlineShort: t.social.friendsOnline(onlineCount),
      openFullChat: t.social.openFullChat,
      pendingRequests: incomingCount > 0 ? t.social.pendingRequests(incomingCount) : null,
      send: t.social.send,
      sending: t.social.sending,
      unreadMessages: unreadChatCount > 0 ? t.social.unreadMessages(unreadChatCount) : null,
      writeMessage: t.social.writeMessage
    }
  };
}
