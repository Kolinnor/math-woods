import { NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { directChatPair, acceptedFriendshipBetween, sendDirectChatMessage } from "@/lib/direct-chat";
import { prisma } from "@/lib/db";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { isVerifiedContributor } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) return NextResponse.json({ error: "Email verification required." }, { status: 403 });

  const { username } = await params;
  const url = new URL(request.url);
  const afterIdRaw = Number(url.searchParams.get("afterId") ?? 0);
  const afterId = Number.isInteger(afterIdRaw) && afterIdRaw > 0 ? afterIdRaw : 0;

  const otherUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, deletedAt: true }
  });

  if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  const friendship = await acceptedFriendshipBetween(user.id, otherUser.id);
  if (!friendship) {
    return NextResponse.json({ error: "You can only chat with accepted friends." }, { status: 403 });
  }
  if (afterId === 0) {
    await markNotificationsReadForHref(user.id, `/chat/${otherUser.username}`, NotificationType.CHAT_MESSAGE);
  }

  const pair = directChatPair(user.id, otherUser.id);
  const chat = await prisma.directChat.findUnique({
    where: { userAId_userBId: pair },
    select: { id: true }
  });

  if (!chat) {
    return NextResponse.json({ messages: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      directChatId: chat.id,
      id: { gt: afterId }
    },
    include: { author: { select: { id: true, username: true, displayName: true } } },
    orderBy: { id: afterId > 0 ? "asc" : "desc" },
    take: 50
  });
  if (afterId === 0) messages.reverse();

  return NextResponse.json(
    {
      messages: messages.map((message) => ({
        id: message.id,
        authorId: message.authorId,
        authorUsername: message.author.username,
        authorName: displayNameForUser(message.author),
        bodyHtml: message.bodyHtml,
        createdAt: message.createdAt.toISOString()
      }))
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isVerifiedContributor(user)) return NextResponse.json({ error: "Email verification required." }, { status: 403 });

  const { username } = await params;

  try {
    await assertRateLimit(`chat-message:${user.id}`, 30, 60_000);
    const body = await request.json() as { bodyMarkdown?: unknown };
    const message = await sendDirectChatMessage(
      user,
      username,
      typeof body.bodyMarkdown === "string" ? body.bodyMarkdown : ""
    );
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be sent.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Too many requests") ? 429 : 400 });
  }
}
