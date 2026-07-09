import { FriendshipStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { createChatMessageAction, sendFriendRequestAction } from "@/lib/actions/social-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function directChatPair(userId: number, otherUserId: number) {
  return userId < otherUserId
    ? { userAId: userId, userBId: otherUserId }
    : { userAId: otherUserId, userBId: userId };
}

export default async function ChatPage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireVerifiedUser();
  const { username } = await params;
  const otherUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, deletedAt: true }
  });

  if (!otherUser || otherUser.deletedAt || otherUser.id === user.id) notFound();

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
  const messages = chat?.messages ?? [];

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

      <section className="chat-thread panel p-5">
        {messages.map((message) => {
          const ownMessage = message.authorId === user.id;
          return (
            <article key={message.id} className={ownMessage ? "chat-message chat-message-own" : "chat-message"}>
              <p className="meta">
                <Link href={`/profile/${message.author.username}`}>{displayNameForUser(message.author)}</Link>
                {" \u00b7 "}
                {message.createdAt.toLocaleString("en-US")}
              </p>
              <MarkdownBlock html={message.bodyHtml} />
            </article>
          );
        })}
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
      </section>

      <form action={createChatMessageAction.bind(null, otherUser.username)} className="panel mt-5 grid gap-3 p-5">
        <h2 className="font-semibold">Message</h2>
        <LazyMarkdownEditor
          name="bodyMarkdown"
          minHeight="9rem"
          lineNumbers={false}
          draftKey={`chat:${otherUser.id}:message`}
          resetSignal={messages.length}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
