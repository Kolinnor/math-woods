import { FriendshipStatus, NotificationType } from "@prisma/client";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { displayNameForUser } from "@/lib/user-display";

export type DirectChatMessage = {
  id: number;
  authorId: number;
  authorUsername: string;
  authorName: string;
  bodyHtml: string;
  createdAt: string;
};

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

export async function sendDirectChatMessage(
  user: { id: number; username: string; displayName?: string | null },
  otherUsername: string,
  rawBodyMarkdown: FormDataEntryValue | string | null | undefined
): Promise<DirectChatMessage> {
  const bodyMarkdown = requiredBoundedText(rawBodyMarkdown, CONTENT_LIMITS.discussionPost, "Message");
  const otherUser = await prisma.user.findUnique({
    where: { username: otherUsername },
    select: { id: true, username: true, deletedAt: true }
  });

  if (!otherUser || otherUser.deletedAt) throw new Error("User not found.");
  if (otherUser.id === user.id) throw new Error("You cannot chat with yourself.");

  const friendship = await acceptedFriendshipBetween(user.id, otherUser.id);
  if (!friendship) throw new Error("You can only chat with accepted friends.");

  const pair = directChatPair(user.id, otherUser.id);
  const chat = await prisma.directChat.upsert({
    where: { userAId_userBId: pair },
    update: { updatedAt: new Date() },
    create: pair
  });
  const { renderMarkdown } = await import("@/lib/markdown");
  const message = await prisma.chatMessage.create({
    data: {
      directChatId: chat.id,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdown(bodyMarkdown)
    }
  });

  await createNotification({
    userId: otherUser.id,
    actorId: user.id,
    type: NotificationType.CHAT_MESSAGE,
    title: "New message",
    body: `${displayNameForUser(user)} sent you a message.`,
    href: `/chat/${user.username}`
  });

  return {
    id: message.id,
    authorId: user.id,
    authorUsername: user.username,
    authorName: displayNameForUser(user),
    bodyHtml: message.bodyHtml,
    createdAt: message.createdAt.toISOString()
  };
}
