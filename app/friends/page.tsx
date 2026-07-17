import { FriendshipStatus, NotificationType } from "@prisma/client";
import Link from "next/link";
import { AddFriendForm } from "@/components/AddFriendForm";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction
} from "@/lib/actions/social-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { PROBLEM_DOMAIN_HERO_ART } from "@/lib/problem-hero-art";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const SOCIAL_HERO_ART = PROBLEM_DOMAIN_HERO_ART["linear-algebra"];

async function acceptedFriendshipsForUser(userId: number) {
  return prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ requesterId: userId }, { addresseeId: userId }]
    },
    include: {
      requester: { select: { id: true, username: true, displayName: true } },
      addressee: { select: { id: true, username: true, displayName: true } }
    },
    orderBy: { updatedAt: "desc" }
  });
}

type FriendRow = Awaited<ReturnType<typeof acceptedFriendshipsForUser>>[number];

function otherFriend(friendship: FriendRow, userId: number) {
  return friendship.requesterId === userId ? friendship.addressee : friendship.requester;
}

export default async function FriendsPage() {
  const user = await requireVerifiedUser();
  const t = await getTranslations();
  await markNotificationsReadForHref(user.id, "/friends", NotificationType.FRIEND_REQUEST);
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const [friends, incomingRequests, outgoingRequests, recentChats] = await Promise.all([
    acceptedFriendshipsForUser(user.id),
    prisma.friendship.findMany({
      where: { addresseeId: user.id, status: FriendshipStatus.PENDING },
      include: { requester: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.friendship.findMany({
      where: { requesterId: user.id, status: FriendshipStatus.PENDING },
      include: { addressee: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.directChat.findMany({
      where: {
        OR: [{ userAId: user.id }, { userBId: user.id }]
      },
      include: {
        userA: { select: { id: true, username: true, displayName: true } },
        userB: { select: { id: true, username: true, displayName: true } },
        messages: {
          include: { author: { select: { id: true, username: true, displayName: true } } },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 12
    })
  ]);

  const friendIds = friends.map((friendship) => otherFriend(friendship, user.id).id);
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
  const onlineFriends = friends.filter((friendship) => onlineIds.has(otherFriend(friendship, user.id).id));

  return (
    <ForestPageLayout
      title={t.social.friends}
      eyebrow={t.social.social}
      heroImage={SOCIAL_HERO_ART.src}
      heroAlt={SOCIAL_HERO_ART.alt}
      description={t.social.friendsOnline(onlineFriends.length)}
    >
      <div className="friends-page-grid">
        <section className="panel grid gap-4 p-5">
          <div>
            <h2 className="font-semibold">{t.social.addFriendTitle}</h2>
            <p className="muted text-sm">{t.social.addFriendDescription}</p>
          </div>
          <AddFriendForm
            labels={{
              addFriend: t.social.addFriend,
              sending: t.social.sending,
              usernamePlaceholder: t.social.usernamePlaceholder
            }}
          />
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">{t.social.onlineFriends}</h2>
          <div className="friend-list">
            {onlineFriends.map((friendship) => {
              const friend = otherFriend(friendship, user.id);
              return (
                <div key={friend.id} className="friend-row">
                  <span className="friend-online-dot" aria-hidden="true" />
                  <Link href={`/profile/${friend.username}`}>{displayNameForUser(friend)}</Link>
                  <Link href={`/chat/${friend.username}` as never} className="button secondary">
                    {t.social.chat}
                  </Link>
                </div>
              );
            })}
            {onlineFriends.length === 0 && <p className="muted">{t.social.noFriendsOnlineNow}</p>}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">{t.social.friendRequests}</h2>
          <div className="friend-list">
            {incomingRequests.map((request) => (
              <div key={request.id} className="friend-row">
                <Link href={`/profile/${request.requester.username}`}>{displayNameForUser(request.requester)}</Link>
                <form action={acceptFriendRequestAction.bind(null, request.id)}>
                  <button type="submit">{t.social.accept}</button>
                </form>
                <form action={declineFriendRequestAction.bind(null, request.id)}>
                  <button type="submit" className="secondary">
                    {t.social.decline}
                  </button>
                </form>
              </div>
            ))}
            {incomingRequests.length === 0 && <p className="muted">{t.social.noPendingRequests}</p>}
          </div>
          {outgoingRequests.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">{t.social.sentRequests}</h3>
              <div className="friend-list">
                {outgoingRequests.map((request) => (
                  <div key={request.id} className="friend-row">
                    <Link href={`/profile/${request.addressee.username}`}>{displayNameForUser(request.addressee)}</Link>
                    <span className="muted text-sm">{t.social.pending}</span>
                    <form action={cancelFriendRequestAction.bind(null, request.id)}>
                      <button type="submit" className="secondary">
                        {t.social.cancel}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">{t.social.allFriends}</h2>
          <div className="friend-list">
            {friends.map((friendship) => {
              const friend = otherFriend(friendship, user.id);
              const online = onlineIds.has(friend.id);
              return (
                <div key={friend.id} className="friend-row">
                  <span className={online ? "friend-online-dot" : "friend-offline-dot"} aria-hidden="true" />
                  <Link href={`/profile/${friend.username}`}>{displayNameForUser(friend)}</Link>
                  <Link href={`/chat/${friend.username}` as never} className="button secondary">
                    {t.social.chat}
                  </Link>
                  <form action={removeFriendAction.bind(null, friendship.id)}>
                    <button type="submit" className="secondary">
                      {t.social.remove}
                    </button>
                  </form>
                </div>
              );
            })}
            {friends.length === 0 && <p className="muted">{t.social.noFriendsYet}</p>}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">{t.social.recentChats}</h2>
          <div className="friend-list">
            {recentChats.map((chat) => {
              const friend = chat.userAId === user.id ? chat.userB : chat.userA;
              const latest = chat.messages[0];
              return (
                <Link key={chat.id} href={`/chat/${friend.username}` as never} className="chat-preview-row">
                  <strong>{displayNameForUser(friend)}</strong>
                  <span>
                    {latest
                      ? `${displayNameForUser(latest.author)}: ${latest.bodyMarkdown.slice(0, 120)}`
                      : t.social.noMessagesYet}
                  </span>
                </Link>
              );
            })}
            {recentChats.length === 0 && <p className="muted">{t.social.noChatsYet}</p>}
          </div>
        </section>
      </div>
    </ForestPageLayout>
  );
}
