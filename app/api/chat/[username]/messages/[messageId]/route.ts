import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteStoredChatImage } from "@/lib/chat-images";
import { acceptedFriendshipBetween, directChatPair } from "@/lib/direct-chat";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { createPresignedImageDownload, getChatImageStorageConfig } from "@/lib/image-storage";
import { renderMarkdown } from "@/lib/markdown";
import { isVerifiedContributor } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { username, messageId: messageIdParam } = await params;
  const messageId = Number(messageIdParam);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const otherUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true, deletedAt: true }
  });
  if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
  const friendship = await acceptedFriendshipBetween(user.id, otherUser.id);
  if (!friendship) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const pair = directChatPair(user.id, otherUser.id);
  const message = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      imageKey: { not: null },
      deletedAt: null,
      directChat: {
        userAId: pair.userAId,
        userBId: pair.userBId
      }
    },
    select: { imageKey: true }
  });
  if (!message?.imageKey) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const config = getChatImageStorageConfig();
  if (!config) {
    return NextResponse.json({ error: "Private chat image storage is not configured." }, { status: 503 });
  }

  const download = createPresignedImageDownload(config, message.imageKey);
  const response = NextResponse.redirect(download.url, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ username: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) {
    return NextResponse.json({ error: "Email verification required." }, { status: 403 });
  }

  const { username, messageId: messageIdParam } = await params;
  const messageId = Number(messageIdParam);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  try {
    await assertRateLimit(`chat-message-edit:${user.id}`, 30, 60_000);
    const payload = await request.json() as { bodyMarkdown?: unknown };
    const bodyMarkdown = requiredBoundedText(
      typeof payload.bodyMarkdown === "string" ? payload.bodyMarkdown : "",
      CONTENT_LIMITS.discussionPost,
      "Message"
    );

    const otherUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, deletedAt: true }
    });
    if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const acceptedFriendship = await acceptedFriendshipBetween(user.id, otherUser.id);
    if (!acceptedFriendship) {
      return NextResponse.json({ error: "You can only edit messages in chats with accepted friends." }, { status: 403 });
    }

    const pair = directChatPair(user.id, otherUser.id);
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        authorId: user.id,
        deletedAt: null,
        directChat: {
          userAId: pair.userAId,
          userBId: pair.userBId
        }
      },
      select: { id: true, bodyMarkdown: true }
    });
    if (!existingMessage) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    if (existingMessage.bodyMarkdown === bodyMarkdown) {
      return NextResponse.json({ error: "The message has not changed." }, { status: 400 });
    }

    const editedAt = new Date();
    const message = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        bodyMarkdown,
        bodyHtml: await renderMarkdown(bodyMarkdown),
        editedAt
      },
      select: {
        id: true,
        bodyMarkdown: true,
        bodyHtml: true,
        editedAt: true
      }
    });

    return NextResponse.json({
      message: {
        messageId: message.id,
        bodyMarkdown: message.bodyMarkdown,
        bodyHtml: message.bodyHtml,
        editedAt: message.editedAt?.toISOString() ?? null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be edited.";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Too many requests") ? 429 : 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ username: string; messageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) {
    return NextResponse.json({ error: "Email verification required." }, { status: 403 });
  }

  const { username, messageId: messageIdParam } = await params;
  const messageId = Number(messageIdParam);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  try {
    await assertRateLimit(`chat-message-delete:${user.id}`, 30, 60_000);
    const otherUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, deletedAt: true }
    });
    if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const acceptedFriendship = await acceptedFriendshipBetween(user.id, otherUser.id);
    if (!acceptedFriendship) {
      return NextResponse.json({ error: "You can only delete messages in chats with accepted friends." }, { status: 403 });
    }

    const pair = directChatPair(user.id, otherUser.id);
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        authorId: user.id,
        deletedAt: null,
        directChat: {
          userAId: pair.userAId,
          userBId: pair.userBId
        }
      },
      select: { id: true, imageKey: true }
    });
    if (!existingMessage) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        bodyMarkdown: "",
        bodyHtml: "",
        imageKey: null,
        imageWidth: null,
        imageHeight: null,
        editedAt: null,
        deletedAt: new Date()
      }
    });

    if (existingMessage.imageKey) {
      const config = getChatImageStorageConfig();
      if (config) await deleteStoredChatImage(config, existingMessage.imageKey).catch(() => false);
    }

    return NextResponse.json({ messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be deleted.";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Too many requests") ? 429 : 400 }
    );
  }
}
