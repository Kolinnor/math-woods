import { FriendshipStatus, NotificationType, Role } from "@prisma/client";
import {
  chatImageDailyLimitForRole,
  chatImageUrl,
  CHAT_IMAGE_ROLLING_WINDOW_MS
} from "@/lib/chat-image-config";
import {
  deleteStoredChatImage,
  storeChatImage
} from "@/lib/chat-images";
import { CONTENT_LIMITS, boundedText } from "@/lib/content-limits";
import type { ChatReactionSummary } from "@/lib/chat-reactions";
import { normalizeChatReplyToId, type ChatReplyPreview } from "@/lib/chat-replies";
import { prisma } from "@/lib/db";
import { getChatImageStorageConfig } from "@/lib/image-storage";
import { renderMarkdown } from "@/lib/markdown";
import { createNotification } from "@/lib/notifications";
import { displayNameForUser } from "@/lib/user-display";
import { usernameLookupFilter } from "@/lib/usernames";

export type DirectChatMessage = {
  id: number;
  authorId: number;
  authorUsername: string;
  authorProfileSlug: string;
  authorName: string;
  authorAvatarBackground: string | null;
  authorAvatarUrl: string | null;
  bodyMarkdown: string;
  bodyHtml: string;
  createdAt: string;
  editedAt: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  replyTo: ChatReplyPreview | null;
  reactions: ChatReactionSummary[];
};

type DirectChatReplySource = {
  id: number;
  authorId: number;
  bodyMarkdown: string;
  imageKey: string | null;
  author: {
    username: string;
    displayName: string | null;
  };
};

export function directChatReplyPreview(replyTo: DirectChatReplySource | null): ChatReplyPreview | null {
  if (!replyTo) return null;
  return {
    id: replyTo.id,
    authorId: replyTo.authorId,
    authorName: displayNameForUser(replyTo.author),
    bodyMarkdown: replyTo.bodyMarkdown,
    hasImage: Boolean(replyTo.imageKey)
  };
}

export function directChatPair(userId: number, otherUserId: number) {
  return userId < otherUserId
    ? { userAId: userId, userBId: otherUserId }
    : { userAId: otherUserId, userBId: userId };
}

export async function materializeFriendRequestIntro(friendship: {
  requesterId: number;
  addresseeId: number;
  introMessage: string | null;
  createdAt: Date;
}) {
  if (!friendship.introMessage) return;

  const pair = directChatPair(friendship.requesterId, friendship.addresseeId);
  const bodyHtml = await renderMarkdown(friendship.introMessage);
  const chat = await prisma.directChat.upsert({
    where: { userAId_userBId: pair },
    update: {},
    create: pair
  });
  await prisma.chatMessage.create({
    data: {
      directChatId: chat.id,
      authorId: friendship.requesterId,
      bodyMarkdown: friendship.introMessage,
      bodyHtml,
      createdAt: friendship.createdAt
    }
  });
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
  user: {
    id: number;
    username: string;
    profileSlug: string;
    displayName?: string | null;
    avatarBackground?: string | null;
    avatarUrl?: string | null;
    role: Role;
  },
  otherUsername: string,
  rawBodyMarkdown: FormDataEntryValue | string | null | undefined,
  rawImage?: FormDataEntryValue | null,
  rawReplyToId?: FormDataEntryValue | string | number | null
): Promise<DirectChatMessage> {
  const bodyMarkdown = boundedText(rawBodyMarkdown, CONTENT_LIMITS.discussionPost, "Message");
  const image = rawImage instanceof File && rawImage.size > 0 ? rawImage : null;
  if (!bodyMarkdown && !image) throw new Error("Write a message or attach an image.");
  const otherUser = await prisma.user.findFirst({
    where: { username: usernameLookupFilter(otherUsername) },
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
  const replyToId = normalizeChatReplyToId(rawReplyToId);
  const replyToMessage = replyToId
    ? await prisma.chatMessage.findFirst({
        where: { id: replyToId, directChatId: chat.id },
        select: {
          id: true,
          authorId: true,
          bodyMarkdown: true,
          imageKey: true,
          author: {
            select: {
              username: true,
              displayName: true
            }
          }
        }
      })
    : null;
  if (replyToId && !replyToMessage) throw new Error("The message you are replying to was not found.");
  let storedImage = null;
  if (image) {
    const dailyLimit = chatImageDailyLimitForRole(user.role);
    if (Number.isFinite(dailyLimit)) {
      const recentImageCount = await prisma.chatMessage.count({
        where: {
          authorId: user.id,
          imageKey: { not: null },
          createdAt: { gte: new Date(Date.now() - CHAT_IMAGE_ROLLING_WINDOW_MS) }
        }
      });
      if (recentImageCount >= dailyLimit) {
        throw new Error(`You can send up to ${dailyLimit} chat images every 24 hours.`);
      }
    }
    storedImage = await storeChatImage(user.id, image);
  }

  const { renderMarkdown } = await import("@/lib/markdown");
  let message;
  try {
    message = await prisma.chatMessage.create({
      data: {
        directChatId: chat.id,
        authorId: user.id,
        replyToId: replyToMessage?.id ?? null,
        bodyMarkdown,
        bodyHtml: bodyMarkdown ? await renderMarkdown(bodyMarkdown) : "",
        imageKey: storedImage?.key ?? null,
        imageWidth: storedImage?.width ?? null,
        imageHeight: storedImage?.height ?? null,
        imageBytes: storedImage?.bytes ?? null
      }
    });
  } catch (error) {
    const config = storedImage ? getChatImageStorageConfig() : null;
    if (config && storedImage) {
      await deleteStoredChatImage(config, storedImage.key).catch(() => false);
    }
    throw error;
  }

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
    authorProfileSlug: user.profileSlug,
    authorName: displayNameForUser(user),
    authorAvatarBackground: user.avatarBackground ?? null,
    authorAvatarUrl: user.avatarUrl ?? null,
    bodyMarkdown: message.bodyMarkdown,
    bodyHtml: message.bodyHtml,
    createdAt: message.createdAt.toISOString(),
    editedAt: null,
    imageUrl: chatImageUrl(otherUsername, message.id, Boolean(message.imageKey)),
    imageWidth: message.imageWidth,
    imageHeight: message.imageHeight,
    replyTo: directChatReplyPreview(replyToMessage),
    reactions: []
  };
}
