import { FriendshipStatus } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export async function FriendsMenu({ userId }: { userId: number }) {
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const [friendships, incomingCount] = await Promise.all([
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
  const onlineFriends = friendships
    .map((friendship) => (friendship.requesterId === userId ? friendship.addressee : friendship.requester))
    .filter((friend) => onlineIds.has(friend.id));

  return (
    <details className="friends-menu">
      <summary aria-label="Open friends menu" title="Friends">
        <span className="friend-online-dot" aria-hidden="true" />
        <span>{onlineFriends.length} online</span>
        {incomingCount > 0 && <strong>{incomingCount}</strong>}
      </summary>
      <div className="friends-menu-popover">
        <Link href={"/friends" as never} className="friends-menu-title">
          Friends
        </Link>
        {onlineFriends.map((friend) => (
          <Link key={friend.id} href={`/chat/${friend.username}` as never} className="friends-menu-row">
            <span className="friend-online-dot" aria-hidden="true" />
            <span>{displayNameForUser(friend)}</span>
          </Link>
        ))}
        {onlineFriends.length === 0 && <p>No friends online.</p>}
        {incomingCount > 0 && (
          <Link href={"/friends" as never} className="friends-menu-request">
            {incomingCount} pending {incomingCount === 1 ? "request" : "requests"}
          </Link>
        )}
      </div>
    </details>
  );
}
