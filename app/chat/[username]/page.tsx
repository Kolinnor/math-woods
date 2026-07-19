import { FriendshipStatus, NotificationType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveChatThread, type LiveChatMessage } from "@/components/LiveChatThread";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { createChatMessageAction, sendFriendRequestAction } from "@/lib/actions/social-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { directChatPair } from "@/lib/direct-chat";
import { dictionaryForLocale, getInterfaceLocale } from "@/lib/i18n/server";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { PROBLEM_DOMAIN_HERO_ART } from "@/lib/problem-hero-art";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";
const SOCIAL_HERO_ART = PROBLEM_DOMAIN_HERO_ART["linear-algebra"];

export default async function ChatPage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireVerifiedUser();
  const [locale, timeZone] = await Promise.all([getInterfaceLocale(), getRequestTimeZone()]);
  const t = dictionaryForLocale(locale);
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
      <ForestPageLayout
        title={displayNameForUser(otherUser)}
        eyebrow={t.social.privateChat}
        heroImage={SOCIAL_HERO_ART.src}
        heroAlt={SOCIAL_HERO_ART.alt}
        description={t.social.privateChatDescription}
        workspaceClassName="forest-page-workspace-narrow"
        actions={
          <Link href={"/friends" as never} className="button secondary">
            {t.social.friends}
          </Link>
        }
      >
        <section className="panel grid gap-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">{t.social.friendsOnly}</h2>
          </div>
          <p className="muted">{t.social.friendsOnlyDescription}</p>
          <div className="flex flex-wrap gap-2">
            <form action={sendFriendRequestAction.bind(null, otherUser.username)}>
              <button type="submit">{t.social.sendFriendRequest}</button>
            </form>
            <Link href={"/friends" as never} className="button secondary">
              {t.social.friends}
            </Link>
          </div>
        </section>
      </ForestPageLayout>
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
    <ForestPageLayout
      title={displayNameForUser(otherUser)}
      eyebrow={t.social.privateChat}
      heroImage={SOCIAL_HERO_ART.src}
      heroAlt={SOCIAL_HERO_ART.alt}
      description={t.social.privateChatDescription}
      workspaceClassName="forest-page-workspace-narrow"
      actions={
        <>
          <Link href={"/friends" as never} className="button secondary">
            {t.social.friends}
          </Link>
          <Link href={`/profile/${otherUser.username}`} className="button secondary">
            {t.social.profile}
          </Link>
        </>
      }
    >
      <div className="chat-page">
        <LiveChatThread
          key={otherUser.username}
          currentUserId={user.id}
          otherUsername={otherUser.username}
          initialMessages={messages}
          locale={locale}
          timeZone={timeZone}
          labels={{
            live: t.social.live,
            livePaused: t.social.livePaused,
            noMessagesYet: t.social.noMessagesYet
          }}
        />

        <form action={createChatMessageAction.bind(null, otherUser.username)} className="panel mt-5 grid gap-3 p-5">
          <h2 className="font-semibold">{t.social.message}</h2>
          <LazyMarkdownEditor
            name="bodyMarkdown"
            minHeight="9rem"
            lineNumbers={false}
            draftKey={`chat:${otherUser.id}:message`}
            resetSignal={ownMessageResetSignal}
          />
          <button type="submit">{t.social.send}</button>
        </form>
      </div>
    </ForestPageLayout>
  );
}
