import { FriendshipStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ChatReactionLabels } from "@/lib/chat-reactions";
import { dictionaryForLocale, getInterfaceLocale } from "@/lib/i18n/server";
import type { InterfaceLocale } from "@/lib/i18n/types";
import type { ProblemChallengeLabels } from "@/lib/problem-challenges";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import { ONLINE_WINDOW_MS } from "@/lib/online-users";
import { canUseOwnerTools, type PermissionUser } from "@/lib/permissions";
import { activeSitePresenceCount } from "@/lib/site-presence";
import { displayNameForUser } from "@/lib/user-display";

export type FriendsMenuData = {
  actionCount: number;
  currentUserId: number;
  incomingCount: number;
  locale: InterfaceLocale;
  friends: Array<{
    id: number;
    avatarBackground: string | null;
    avatarUrl: string | null;
    lastSeenAt: string | null;
    name: string;
    online: boolean;
    unreadCount: number;
    unreadLabel: string | null;
    username: string;
    profileSlug: string;
  }>;
  timeZone: string | null;
  totalOnlineCount: number | null;
  unreadChatCount: number;
  labels: {
    friends: string;
    friendsMenuSettings: string;
    closeFriendsMenu: string;
    searchFriends: string;
    sortBy: string;
    sortRecent: string;
    sortAlphabetical: string;
    showOfflineUsers: string;
    backToFriends: string;
    challenge: ProblemChallengeLabels;
    reactions: ChatReactionLabels;
    cancel: string;
    cancelReply: string;
    confirmDeleteMessage: string;
    deleteMessage: string;
    deletingMessage: string;
    attachImage: string;
    chatImage: string;
    closeChat: string;
    editMessage: string;
    edited: string;
    imageRequirements: string;
    noFriendsYet: string;
    noFriendsToShow: string;
    noMessagesYet: string;
    conversationLoadError: string;
    messageSendError: string;
    editMessageError: string;
    deleteMessageError: string;
    newMessagesBelow: string;
    offline: string;
    online: string;
    onlineShort: string;
    openFullChat: string;
    pendingRequests: string | null;
    send: string;
    saveChanges: string;
    scrollToLatestMessages: string;
    removeImage: string;
    reply: string;
    replyingTo: string;
    sending: string;
    unreadMessages: string | null;
    writeMessage: string;
  };
};

export async function friendsMenuDataForUser(user: PermissionUser): Promise<FriendsMenuData> {
  const userId = user.id;
  const [locale, timeZone, totalOnlineCount] = await Promise.all([
    getInterfaceLocale(),
    getRequestTimeZone(),
    canUseOwnerTools(user) ? activeSitePresenceCount() : Promise.resolve(null)
  ]);
  const t = dictionaryForLocale(locale);
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const [friendships, incomingCount, unreadChatGroups] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { addresseeId: userId }]
      },
      include: {
        requester: {
          select: { id: true, username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true }
        },
        addressee: {
          select: { id: true, username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.friendship.count({
      where: {
        addresseeId: userId,
        status: FriendshipStatus.PENDING
      }
    }),
    prisma.notification.groupBy({
      by: ["actorId"],
      where: {
        userId,
        readAt: null,
        type: NotificationType.CHAT_MESSAGE
      },
      _count: { _all: true }
    })
  ]);
  const unreadChatCount = unreadChatGroups.reduce((total, group) => total + group._count._all, 0);
  const unreadByFriendId = new Map<number, number>();
  for (const group of unreadChatGroups) {
    if (group.actorId === null) continue;
    unreadByFriendId.set(group.actorId, group._count._all);
  }
  const friendIds = friendships.map((friendship) =>
    friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId
  );
  const [onlineSessions, latestSessionGroups] = friendIds.length
    ? await Promise.all([
        prisma.session.findMany({
          where: {
            userId: { in: friendIds },
            lastSeenAt: { gte: onlineSince },
            expiresAt: { gt: now }
          },
          distinct: ["userId"],
          select: { userId: true }
        }),
        prisma.session.groupBy({
          by: ["userId"],
          where: { userId: { in: friendIds } },
          _max: { lastSeenAt: true }
        })
      ])
    : [[], []];
  const onlineIds = new Set(onlineSessions.map((session) => session.userId));
  const lastSeenByFriendId = new Map(
    latestSessionGroups.map((session) => [session.userId, session._max.lastSeenAt?.toISOString() ?? null])
  );
  const friends = friendships
    .map((friendship) => (friendship.requesterId === userId ? friendship.addressee : friendship.requester))
    .map((friend) => {
      const unreadCount = unreadByFriendId.get(friend.id) ?? 0;
      return {
        id: friend.id,
        avatarBackground: friend.avatarBackground,
        avatarUrl: friend.avatarUrl,
        lastSeenAt: lastSeenByFriendId.get(friend.id) ?? null,
        name: displayNameForUser(friend),
        online: onlineIds.has(friend.id),
        unreadCount,
        unreadLabel: unreadCount > 0 ? t.social.unreadMessages(unreadCount) : null,
        username: friend.username,
        profileSlug: friend.profileSlug
      };
    })
    .sort(
      (left, right) =>
        Number(right.unreadCount > 0) - Number(left.unreadCount > 0) ||
        right.unreadCount - left.unreadCount ||
        Number(right.online) - Number(left.online) ||
        left.name.localeCompare(right.name)
    );
  const onlineCount = friends.filter((friend) => friend.online).length;
  const actionCount = incomingCount + unreadChatCount;

  return {
    actionCount,
    currentUserId: userId,
    incomingCount,
    locale,
    friends,
    timeZone,
    totalOnlineCount,
    unreadChatCount,
    labels: {
      friends: t.social.friends,
      friendsMenuSettings: t.social.friendsMenuSettings,
      closeFriendsMenu: t.social.closeFriendsMenu,
      searchFriends: t.social.searchFriends,
      sortBy: t.social.sortBy,
      sortRecent: t.social.sortRecent,
      sortAlphabetical: t.social.sortAlphabetical,
      showOfflineUsers: t.social.showOfflineUsers,
      backToFriends: t.social.backToFriends,
      challenge: t.social.challenge,
      reactions: {
        addReaction: t.social.addReaction,
        saveError: t.social.reactionSaveError,
        reactionNames: t.social.reactionNames
      },
      cancel: t.social.cancel,
      cancelReply: t.social.cancelReply,
      confirmDeleteMessage: t.social.confirmDeleteMessage,
      deleteMessage: t.social.deleteMessage,
      deletingMessage: t.social.deletingMessage,
      attachImage: t.social.attachImage,
      chatImage: t.social.chatImage,
      closeChat: t.social.closeChat,
      editMessage: t.social.editMessage,
      edited: t.social.edited,
      imageRequirements: t.social.imageRequirements,
      noFriendsYet: t.social.noFriendsYet,
      noFriendsToShow: t.social.noFriendsToShow,
      noMessagesYet: t.social.noMessagesYet,
      conversationLoadError: t.social.conversationLoadError,
      messageSendError: t.social.messageSendError,
      editMessageError: t.social.editMessageError,
      deleteMessageError: t.social.deleteMessageError,
      newMessagesBelow: t.social.newMessagesBelowLabel,
      offline: t.social.offline,
      online: t.social.online,
      onlineShort: t.social.friendsOnline(onlineCount),
      openFullChat: t.social.openFullChat,
      pendingRequests: incomingCount > 0 ? t.social.pendingRequests(incomingCount) : null,
      send: t.social.send,
      saveChanges: t.social.saveChanges,
      scrollToLatestMessages: t.social.scrollToLatestMessages,
      removeImage: t.social.removeImage,
      reply: t.social.reply,
      replyingTo: t.social.replyingTo,
      sending: t.social.sending,
      unreadMessages: unreadChatCount > 0 ? t.social.unreadMessages(unreadChatCount) : null,
      writeMessage: t.social.writeMessage
    }
  };
}
