import { NotificationType, Prisma, Role } from "@prisma/client";
import { displayNameForUser } from "./user-display.ts";

export async function inviteNewUserFromOwner(tx: Prisma.TransactionClient, newUserId: number) {
  const owner = await tx.user.findFirst({
    where: {
      role: Role.OWNER,
      deletedAt: null,
      id: { not: newUserId }
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true
    }
  });

  if (!owner) return null;

  const existingFriendship = await tx.friendship.findFirst({
    where: {
      OR: [
        { requesterId: owner.id, addresseeId: newUserId },
        { requesterId: newUserId, addresseeId: owner.id }
      ]
    },
    select: { id: true }
  });

  if (existingFriendship) return existingFriendship;

  const friendship = await tx.friendship.create({
    data: {
      requesterId: owner.id,
      addresseeId: newUserId
    },
    select: { id: true }
  });

  const notificationPreference = await tx.notificationPreference.findUnique({
    where: {
      userId_type: {
        userId: newUserId,
        type: NotificationType.FRIEND_REQUEST
      }
    },
    select: { enabled: true }
  });

  if (notificationPreference?.enabled !== false) {
    await tx.notification.create({
      data: {
        userId: newUserId,
        actorId: owner.id,
        type: NotificationType.FRIEND_REQUEST,
        title: "New friend request",
        body: `${displayNameForUser(owner)} sent you a friend request.`,
        href: "/friends"
      }
    });
  }

  return friendship;
}
