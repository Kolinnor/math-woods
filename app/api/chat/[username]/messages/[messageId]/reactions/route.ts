import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isChatReaction, summarizeChatReactions } from "@/lib/chat-reactions";
import { acceptedFriendshipBetween, directChatPair } from "@/lib/direct-chat";
import { prisma } from "@/lib/db";
import { isVerifiedContributor } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
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
    await assertRateLimit(`chat-reaction:${user.id}`, 60, 60_000);
    const body = await request.json() as { reaction?: unknown };
    const reaction = body.reaction;
    if (!isChatReaction(reaction)) {
      return NextResponse.json({ error: "Unknown reaction." }, { status: 400 });
    }

    const otherUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, deletedAt: true }
    });
    if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const friendship = await acceptedFriendshipBetween(user.id, otherUser.id);
    if (!friendship) {
      return NextResponse.json({ error: "You can only react in chats with accepted friends." }, { status: 403 });
    }

    const pair = directChatPair(user.id, otherUser.id);
    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        directChat: {
          userAId: pair.userAId,
          userBId: pair.userBId
        }
      },
      select: { id: true }
    });
    if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

    const reactions = await prisma.$transaction(async (tx) => {
      const existing = await tx.chatMessageReaction.findUnique({
        where: {
          messageId_userId_reaction: {
            messageId,
            userId: user.id,
            reaction
          }
        },
        select: { id: true }
      });

      if (existing) {
        await tx.chatMessageReaction.delete({ where: { id: existing.id } });
      } else {
        await tx.chatMessageReaction.create({
          data: {
            messageId,
            userId: user.id,
            reaction
          }
        });
      }

      await tx.chatMessage.update({
        where: { id: messageId },
        data: { updatedAt: new Date() }
      });

      return tx.chatMessageReaction.findMany({
        where: { messageId },
        select: {
          reaction: true,
          userId: true
        }
      });
    });

    return NextResponse.json({
      messageId,
      reactions: summarizeChatReactions(reactions, user.id)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reaction could not be saved.";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Too many requests") ? 429 : 400 }
    );
  }
}
