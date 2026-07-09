import { FriendshipStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export function directChatPair(userId: number, otherUserId: number) {
  return userId < otherUserId
    ? { userAId: userId, userBId: otherUserId }
    : { userAId: otherUserId, userBId: userId };
}

export async function acceptedFriendshipBetween(userId: number, otherUserId: number) {
  return prisma.friendship.findFirst({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId }
      ]
    }
  });
}
