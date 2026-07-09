import { FriendshipStatus, NotificationType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveChatThread, type LiveChatMessage } from "@/components/LiveChatThread";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { createChatMessageAction, sendFriendRequestAction } from "@/lib/actions/social-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { directChatPair } from "@/lib/direct-chat";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireVerifiedUser();
  const { username } = await params;
  const otherUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, deletedAt: true }
  });

  if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) notFound();
  await markNotificationsReadForHref(user.id, `/chat/${otherUser.username}`, [
    NotificationType.CHAT_MESSAGE,
    NotificationType.FRIEND_REQUEST
  ]);

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: otherUser.id },
        { requesterId: otherUser.id, addresseeId: user.id }
      ]
    },
    include: {
      requester: { select: { id: true, username: true, displayName: true } },
      addressee: { select: { id: true, username: true, displayName: true } }
    }
  });

  if (friendship?.status !== FriendshipStatus.ACCEPTED) {
    return (
      <div className="mx-auto max-w-3xl">
        <section className="panel grid gap-4 p-5">
          <div>
            <p className="muted text-sm">Private chat</p>
            <h1 className="text-2xl font-bold">{displayNameForUser(otherUser)}</h1>
          </div>
          <p className="muted">You can start a private chat once you are friends.</p>
          <div className="flex flex-wrap gap-2">
            <form action={sendFriendRequestAction.bind(null, otherUser.username)}>
              <button type="submit">Send friend request</button>
            </form>
            <Link href={"/friends" as never} className="button secondary">
              Friends
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const pair = directChatPair(user.id, otherUser.id);
  const chat = await prisma.directChat.findUnique({
    where: { userAId_userBId: pair },
    include: {
      messages: {
        include: { author: { select: { id: true, username: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
        take: 100
      }
    }
  });
  const messages: LiveChatMessage[] =
    chat?.messages.map((message) => ({
      id: message.id,
      authorId: message.authorId,
      authorUsername: message.author.username,
      authorName: displayNameForUser(message.author),
      bodyHtml: message.bodyHtml,
      createdAt: message.createdAt.toISOString()
    })) ?? [];
  const ownMessageResetSignal = messages.filter((message) => message.authorId === user.id).at(-1)?.id ?? 0;

  return (
    <div className="chat-page mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="muted text-sm">Private chat</p>
          <h1 className="text-2xl font-bold">{displayNameForUser(otherUser)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={"/friends" as never} className="button secondary">
            Friends
          </Link>
          <Link href={`/profile/${otherUser.username}`} className="button secondary">
            Profile
          </Link>
        </div>
      </div>

      <LiveChatThread
        key={otherUser.username}
        currentUserId={user.id}
        otherUsername={otherUser.username}
        initialMessages={messages}
      />

      <form action={createChatMessageAction.bind(null, otherUser.username)} className="panel mt-5 grid gap-3 p-5">
        <h2 className="font-semibold">Message</h2>
        <LazyMarkdownEditor
          name="bodyMarkdown"
          minHeight="9rem"
          lineNumbers={false}
          draftKey={`chat:${otherUser.id}:message`}
          resetSignal={ownMessageResetSignal}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
