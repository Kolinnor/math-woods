import { NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CHAT_IMAGE_MAX_INPUT_BYTES, chatImageUrl } from "@/lib/chat-image-config";
import { directChatPair, acceptedFriendshipBetween, sendDirectChatMessage } from "@/lib/direct-chat";
import { summarizeChatReactions } from "@/lib/chat-reactions";
import { prisma } from "@/lib/db";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { isVerifiedContributor } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";
const MAX_CHAT_MESSAGE_BODY_BYTES = CHAT_IMAGE_MAX_INPUT_BYTES + 64_000;

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) return NextResponse.json({ error: "Email verification required." }, { status: 403 });

  const { username } = await params;
  const url = new URL(request.url);
  const afterIdRaw = Number(url.searchParams.get("afterId") ?? 0);
  const afterId = Number.isInteger(afterIdRaw) && afterIdRaw > 0 ? afterIdRaw : 0;
  const reactionCursor = Date.now();
  const reactionsAfterRaw = Number(url.searchParams.get("reactionsAfter") ?? 0);
  const reactionsAfter = Number.isFinite(reactionsAfterRaw)
    && reactionsAfterRaw > 0
    && reactionsAfterRaw <= reactionCursor
    ? new Date(reactionsAfterRaw)
    : new Date(0);

  const otherUser = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      avatarBackground: true,
      deletedAt: true
    }
  });

  if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  const friendship = await acceptedFriendshipBetween(user.id, otherUser.id);
  if (!friendship) {
    return NextResponse.json({ error: "You can only chat with accepted friends." }, { status: 403 });
  }
  await markNotificationsReadForHref(user.id, `/chat/${otherUser.username}`, NotificationType.CHAT_MESSAGE);

  const pair = directChatPair(user.id, otherUser.id);
  const chat = await prisma.directChat.findUnique({
    where: { userAId_userBId: pair },
    select: { id: true }
  });

  if (!chat) {
    return NextResponse.json(
      { messages: [], reactionCursor, reactionUpdates: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const [messages, updatedMessages] = await Promise.all([
    prisma.chatMessage.findMany({
      where: {
        directChatId: chat.id,
        id: { gt: afterId }
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            avatarBackground: true
          }
        },
        reactions: {
          select: {
            reaction: true,
            userId: true
          }
        }
      },
      orderBy: { id: afterId > 0 ? "asc" : "desc" },
      take: 50
    }),
    prisma.chatMessage.findMany({
      where: {
        directChatId: chat.id,
        updatedAt: { gt: reactionsAfter }
      },
      select: {
        id: true,
        bodyMarkdown: true,
        bodyHtml: true,
        editedAt: true,
        reactions: {
          select: {
            reaction: true,
            userId: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    })
  ]);
  if (afterId === 0) messages.reverse();

  return NextResponse.json(
    {
      messages: messages.map((message) => ({
        id: message.id,
        authorId: message.authorId,
        authorUsername: message.author.username,
        authorName: displayNameForUser(message.author),
        authorAvatarBackground: message.author.avatarBackground,
        authorAvatarUrl: message.author.avatarUrl,
        bodyMarkdown: message.bodyMarkdown,
        bodyHtml: message.bodyHtml,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        imageUrl: chatImageUrl(otherUser.username, message.id, Boolean(message.imageKey)),
        imageWidth: message.imageWidth,
        imageHeight: message.imageHeight,
        reactions: summarizeChatReactions(message.reactions, user.id)
      })),
      reactionCursor,
      reactionUpdates: updatedMessages.map((message) => ({
        messageId: message.id,
        reactions: summarizeChatReactions(message.reactions, user.id)
      })),
      messageUpdates: updatedMessages.map((message) => ({
        messageId: message.id,
        bodyMarkdown: message.bodyMarkdown,
        bodyHtml: message.bodyHtml,
        editedAt: message.editedAt?.toISOString() ?? null,
        reactions: summarizeChatReactions(message.reactions, user.id)
      }))
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_MESSAGE_BODY_BYTES) {
    return NextResponse.json({ error: "Chat image must be smaller than 5 MB." }, { status: 413 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) return NextResponse.json({ error: "Email verification required." }, { status: 403 });

  const { username } = await params;

  try {
    await assertRateLimit(`chat-message:${user.id}`, 30, 60_000);
    let bodyMarkdown: unknown = "";
    let image: FormDataEntryValue | null = null;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      bodyMarkdown = formData.get("bodyMarkdown");
      image = formData.get("image");
    } else {
      const body = await request.json() as { bodyMarkdown?: unknown };
      bodyMarkdown = body.bodyMarkdown;
    }
    const message = await sendDirectChatMessage(
      user,
      username,
      typeof bodyMarkdown === "string" ? bodyMarkdown : "",
      image
    );
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be sent.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Too many requests") ? 429 : 400 });
  }
}
