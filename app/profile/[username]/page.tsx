import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { FriendshipStatus } from "@prisma/client";
import { ExternalLink, Handshake } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ACHIEVEMENTS } from "@/lib/achievements";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction,
  sendFriendRequestAction
} from "@/lib/actions/social-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { problemLinkClass } from "@/lib/problem-link";
import { PROBLEM_DOMAIN_HERO_ART } from "@/lib/problem-hero-art";
import { hasTrustedPrivileges } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { getUserReputation } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";
const SOCIAL_HERO_ART = PROBLEM_DOMAIN_HERO_ART["linear-algebra"];

export default async function ProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { username } = await params;
  const t = await getTranslations();
  const requestedView = (await searchParams).view;
  const view =
    requestedView === "solved" || requestedView === "favorites" || requestedView === "achievements"
      ? requestedView
      : "overview";
  const currentUser = await getCurrentUser();
  const preferredLanguage = await getPreferredContentLanguage();
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      _count: {
        select: {
          problems: true,
          playlists: true,
          conceptsCreated: true,
          posts: true,
          favorites: true
        }
      }
    }
  });

  if (!user) notFound();

  const [
    problemRows,
    playlists,
    revisions,
    solvedRows,
    favoriteRows,
    achievementUnlocks,
    currentUserSolved,
    reputation,
    friendship
  ] = await Promise.all([
    prisma.problem.findMany({
      where: { authorId: user.id, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.playlist.findMany({
      where: {
        authorId: user.id,
        ...(currentUser && (currentUser.id === user.id || hasTrustedPrivileges(currentUser.role))
          ? {}
          : { status: "PUBLISHED", visibility: "PUBLIC" })
      },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.pageRevision.findMany({
      where: { editedById: user.id },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.problemAttempt.findMany({
      where: { userId: user.id, status: "SOLVED" },
      include: { problem: true },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.problemFavorite.findMany({
      where: { userId: user.id, problem: { authorId: { not: user.id } } },
      include: { problem: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.achievementUnlock.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: "desc" }
    }),
    currentUser
      ? prisma.problemAttempt.findMany({
          where: { userId: currentUser.id, status: "SOLVED" },
          select: { problemId: true }
        })
      : [],
    getUserReputation(user.id),
    currentUser && currentUser.id !== user.id
      ? prisma.friendship.findFirst({
          where: {
            OR: [
              { requesterId: currentUser.id, addresseeId: user.id },
              { requesterId: user.id, addresseeId: currentUser.id }
            ]
          }
        })
      : null
  ]);

  const problemByGroup = new Map<string, (typeof problemRows)[number]>();
  for (const problem of problemRows) {
    const selected = problemByGroup.get(problem.translationGroupId);
    if (!selected || (selected.language !== preferredLanguage && problem.language === preferredLanguage)) {
      problemByGroup.set(problem.translationGroupId, problem);
    }
  }
  const solvedByGroup = new Map<string, (typeof solvedRows)[number]>();
  for (const attempt of solvedRows) {
    const selected = solvedByGroup.get(attempt.problem.translationGroupId);
    if (!selected || (selected.problem.language !== preferredLanguage && attempt.problem.language === preferredLanguage)) {
      solvedByGroup.set(attempt.problem.translationGroupId, attempt);
    }
  }
  const favoritesByGroup = new Map<string, (typeof favoriteRows)[number]>();
  for (const favorite of favoriteRows) {
    const selected = favoritesByGroup.get(favorite.problem.translationGroupId);
    if (!selected || (selected.problem.language !== preferredLanguage && favorite.problem.language === preferredLanguage)) {
      favoritesByGroup.set(favorite.problem.translationGroupId, favorite);
    }
  }
  const problems = [...problemByGroup.values()].slice(0, 10);
  const solved = [...solvedByGroup.values()].slice(0, 50);
  const favorites = [...favoritesByGroup.values()].slice(0, 50);
  const authoredProblemCount = problemByGroup.size;
  const solvedCount = solvedByGroup.size;
  const externalFavoriteCount = favoritesByGroup.size;
  const isSelf = currentUser?.id === user.id;
  const currentUserSolvedIds = new Set(currentUserSolved.map((attempt) => attempt.problemId));
  const achievementUnlockMap = new Map(achievementUnlocks.map((unlock) => [unlock.key, unlock]));
  const profileActions = isSelf ? (
    <Link href={`/profile/${user.username}/edit`} className="button secondary">
      {t.profile.editProfile}
    </Link>
  ) : currentUser && friendship?.status === FriendshipStatus.ACCEPTED ? (
    <div className="flex flex-wrap gap-2">
      <Link href={`/chat/${user.username}` as never} className="button">
        {t.profile.message}
      </Link>
      <form action={removeFriendAction.bind(null, friendship.id)}>
        <button type="submit" className="secondary">
          {t.profile.removeFriend}
        </button>
      </form>
    </div>
  ) : currentUser && friendship?.status === FriendshipStatus.PENDING && friendship.addresseeId === currentUser.id ? (
    <div className="flex flex-wrap gap-2">
      <form action={acceptFriendRequestAction.bind(null, friendship.id)}>
        <button type="submit">{t.profile.acceptFriendRequest}</button>
      </form>
      <form action={declineFriendRequestAction.bind(null, friendship.id)}>
        <button type="submit" className="secondary">
          {t.social.decline}
        </button>
      </form>
    </div>
  ) : currentUser && friendship?.status === FriendshipStatus.PENDING ? (
    <form action={cancelFriendRequestAction.bind(null, friendship.id)}>
      <button type="submit" className="secondary">
        {t.profile.friendRequestSent}
      </button>
    </form>
  ) : currentUser ? (
    <form action={sendFriendRequestAction.bind(null, user.username)}>
      <button type="submit">{t.social.addFriend}</button>
    </form>
  ) : null;

  return (
    <ForestPageLayout
      title={displayNameForUser(user)}
      eyebrow={t.profile.profile}
      heroImage={SOCIAL_HERO_ART.src}
      heroAlt={SOCIAL_HERO_ART.alt}
      description={`${user.mathLevel ? t.auth.mathLevels[user.mathLevel] : t.profile.notSet} / ${t.profile.reputation} ${reputation}`}
      meta={<p>{user.role.toLowerCase()}</p>}
      actions={profileActions}
    >
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <nav className="mb-6 flex flex-wrap gap-2 text-sm">
          <Link href={`/profile/${user.username}`} className="rounded border border-line px-3 py-2">
            {t.profile.overview}
          </Link>
          <Link href={`/profile/${user.username}?view=solved`} className="rounded border border-line px-3 py-2">
            {t.profile.solved} {"\u00b7"} {solvedCount}
          </Link>
          <Link href={`/profile/${user.username}?view=favorites`} className="rounded border border-line px-3 py-2">
            {t.profile.favorites} {"\u00b7"} {externalFavoriteCount}
          </Link>
          <Link href={`/profile/${user.username}?view=achievements`} className="rounded border border-line px-3 py-2">
            {t.profile.achievements} / {achievementUnlocks.length}
          </Link>
        </nav>

        {view === "overview" && (
          <>
            <section className="panel mb-6 p-5">
              <h2 className="mb-3 font-semibold">{t.profile.bio}</h2>
              <p className="whitespace-pre-wrap">{user.bio || t.profile.noBio}</p>
            </section>

            <section className="mb-6">
              <h2 className="mb-3 font-semibold">{t.profile.problems}</h2>
              <div className="grid gap-3">
                {problems.map((problem) => (
                  <Link
                    key={problem.id}
                    href={`/problems/${problem.slug}`}
                    className={problemLinkClass("panel block p-4", currentUserSolvedIds.has(problem.id))}
                  >
                    <AsyncMarkdownInline markdown={problem.title} />
                  </Link>
                ))}
                {problems.length === 0 && <p className="muted panel p-5">{t.profile.noPublicProblems}</p>}
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">{t.profile.playlists}</h2>
              <div className="grid gap-3">
                {playlists.map((playlist) => (
                  <Link key={playlist.id} href={`/explorations/${playlist.slug}/start` as never} className="panel block p-4">
                    {playlist.title}
                  </Link>
                ))}
                {playlists.length === 0 && <p className="muted panel p-5">{t.profile.noPlaylists}</p>}
              </div>
            </section>
          </>
        )}

        {view === "solved" && (
          <section>
            <h2 className="mb-3 font-semibold">{t.profile.solvedProblems}</h2>
            <div className="grid gap-3">
              {solved.map((attempt) => (
                <Link
                  key={attempt.id}
                  href={`/problems/${attempt.problem.slug}`}
                  className={problemLinkClass("panel block p-4", currentUserSolvedIds.has(attempt.problemId))}
                >
                  <AsyncMarkdownInline markdown={attempt.problem.title} />
                </Link>
              ))}
              {solved.length === 0 && <p className="muted panel p-5">{t.profile.noSolvedProblems}</p>}
            </div>
          </section>
        )}

        {view === "favorites" && (
          <section>
            <h2 className="mb-3 font-semibold">{t.profile.favoriteProblems}</h2>
          <div className="grid gap-3">
              {favorites.map((favorite) => (
                <Link
                  key={favorite.problemId}
                  href={`/problems/${favorite.problem.slug}`}
                  className={problemLinkClass("panel block p-4", currentUserSolvedIds.has(favorite.problemId))}
                >
                  <AsyncMarkdownInline markdown={favorite.problem.title} />
              </Link>
            ))}
              {favorites.length === 0 && <p className="muted panel p-5">{t.profile.noFavoriteProblems}</p>}
          </div>
        </section>
        )}

        {view === "achievements" && (
          <section>
            <h2 className="mb-3 font-semibold">{t.profile.achievements}</h2>
            <div className="achievement-grid">
              {ACHIEVEMENTS.map((achievement) => {
                const unlock = achievementUnlockMap.get(achievement.key);

                return (
                  <article
                    key={achievement.key}
                    className={`achievement-card${unlock ? "" : " achievement-card-locked"}`}
                  >
                    <div>
                      <strong>{achievement.title}</strong>
                      <p>{achievement.description}</p>
                    </div>
                    <span>{unlock ? unlock.unlockedAt.toLocaleDateString("en-US") : t.profile.locked}</span>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </article>

      <aside className="grid content-start gap-5">
        {(user.affiliation || user.websiteUrl || user.mathematicalDomains.length > 0 || user.openToCollaboration) && (
          <section className="panel mathematician-profile-details p-5">
            <h2 className="mb-3 font-semibold">{t.profile.mathematicalProfile}</h2>
            {user.affiliation && <p><strong>{t.profile.affiliation}</strong><span>{user.affiliation}</span></p>}
            {user.websiteUrl && (
              <p>
                <strong>{t.profile.website}</strong>
                <a href={user.websiteUrl} target="_blank" rel="noreferrer">{t.profile.visitWebsite} <ExternalLink size={14} /></a>
              </p>
            )}
            {user.mathematicalDomains.length > 0 && (
              <div className="mathematician-domains">
                {user.mathematicalDomains.map((domain) => <span className="tag" key={domain}>{t.home.domainLabels[domain]}</span>)}
              </div>
            )}
            {user.openToCollaboration && <div className="mathematician-profile-collaboration"><Handshake size={16} /> {t.profile.openToCollaboration}</div>}
          </section>
        )}
        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">{t.profile.contributions}</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span>{t.profile.problems}</span>
              <span>{authoredProblemCount}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t.profile.playlists}</span>
              <span>{user._count.playlists}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t.profile.conceptsCreated}</span>
              <span>{user._count.conceptsCreated}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t.profile.discussionPosts}</span>
              <span>{user._count.posts}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t.profile.solved}</span>
              <span>{solvedCount}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{t.profile.favorites}</span>
              <span>{externalFavoriteCount}</span>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">{t.profile.recentEdits}</h2>
          <div className="grid gap-3 text-sm">
            {revisions.map((revision) => (
              <div key={revision.id}>
                <div className="font-medium">{revision.pageType.toLowerCase()} revision {revision.id}</div>
                <div className="muted">{revision.createdAt.toLocaleString("en-US")}</div>
              </div>
            ))}
            {revisions.length === 0 && <p className="muted">{t.profile.noEdits}</p>}
          </div>
        </section>
      </aside>
    </div>
    </ForestPageLayout>
  );
}
