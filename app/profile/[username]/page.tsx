import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mathLevelLabel } from "@/lib/math-levels";
import { problemLinkClass } from "@/lib/problem-link";
import { getUserReputation } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { username } = await params;
  const requestedView = (await searchParams).view;
  const view =
    requestedView === "solved" || requestedView === "favorites" || requestedView === "achievements"
      ? requestedView
      : "overview";
  const currentUser = await getCurrentUser();
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
    problems,
    playlists,
    revisions,
    solved,
    favorites,
    solvedCount,
    externalFavoriteCount,
    achievementUnlocks,
    currentUserSolved,
    reputation
  ] = await Promise.all([
    prisma.problem.findMany({
      where: { authorId: user.id, status: "PUBLISHED", listed: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.playlist.findMany({
      where: { authorId: user.id },
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
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.problemFavorite.findMany({
      where: { userId: user.id, problem: { authorId: { not: user.id } } },
      include: { problem: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.problemAttempt.count({
      where: { userId: user.id, status: "SOLVED" }
    }),
    prisma.problemFavorite.count({
      where: { userId: user.id, problem: { authorId: { not: user.id } } }
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
    getUserReputation(user.id)
  ]);

  const isSelf = currentUser?.id === user.id;
  const currentUserSolvedIds = new Set(currentUserSolved.map((attempt) => attempt.problemId));
  const achievementUnlockMap = new Map(achievementUnlocks.map((unlock) => [unlock.key, unlock]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{displayNameForUser(user)}</h1>
            <p className="muted mt-1">{user.role.toLowerCase()} / reputation {reputation}</p>
            <p className="muted mt-1 text-sm">{mathLevelLabel(user.mathLevel)}</p>
          </div>
          {isSelf && (
            <Link href={`/profile/${user.username}/edit`} className="button secondary">
              Edit profile
            </Link>
          )}
        </div>

        <nav className="mb-6 flex flex-wrap gap-2 text-sm">
          <Link href={`/profile/${user.username}`} className="rounded border border-line px-3 py-2">
            Overview
          </Link>
          <Link href={`/profile/${user.username}?view=solved`} className="rounded border border-line px-3 py-2">
            Solved · {solvedCount}
          </Link>
          <Link href={`/profile/${user.username}?view=favorites`} className="rounded border border-line px-3 py-2">
            Favorites · {externalFavoriteCount}
          </Link>
          <Link href={`/profile/${user.username}?view=achievements`} className="rounded border border-line px-3 py-2">
            Achievements / {achievementUnlocks.length}
          </Link>
        </nav>

        {view === "overview" && (
          <>
            <section className="panel mb-6 p-5">
              <h2 className="mb-3 font-semibold">Bio</h2>
              <p className="whitespace-pre-wrap">{user.bio || "No bio yet."}</p>
            </section>

            <section className="mb-6">
              <h2 className="mb-3 font-semibold">Problems</h2>
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
                {problems.length === 0 && <p className="muted panel p-5">No public problems yet.</p>}
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Playlists</h2>
              <div className="grid gap-3">
                {playlists.map((playlist) => (
                  <Link key={playlist.id} href={`/playlists/${playlist.slug}`} className="panel block p-4">
                    {playlist.title}
                  </Link>
                ))}
                {playlists.length === 0 && <p className="muted panel p-5">No playlists yet.</p>}
              </div>
            </section>
          </>
        )}

        {view === "solved" && (
          <section>
            <h2 className="mb-3 font-semibold">Solved problems</h2>
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
              {solved.length === 0 && <p className="muted panel p-5">No solved problems yet.</p>}
            </div>
          </section>
        )}

        {view === "favorites" && (
          <section>
            <h2 className="mb-3 font-semibold">Favorite problems</h2>
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
              {favorites.length === 0 && <p className="muted panel p-5">No favorite problems yet.</p>}
          </div>
        </section>
        )}

        {view === "achievements" && (
          <section>
            <h2 className="mb-3 font-semibold">Achievements</h2>
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
                    <span>{unlock ? unlock.unlockedAt.toLocaleDateString("en-US") : "Locked"}</span>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </article>

      <aside className="grid content-start gap-5">
        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">Contributions</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span>Problems</span>
              <span>{user._count.problems}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Playlists</span>
              <span>{user._count.playlists}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Concepts created</span>
              <span>{user._count.conceptsCreated}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Discussion posts</span>
              <span>{user._count.posts}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Solved</span>
              <span>{solvedCount}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Favorites</span>
              <span>{externalFavoriteCount}</span>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">Recent edits</h2>
          <div className="grid gap-3 text-sm">
            {revisions.map((revision) => (
              <div key={revision.id}>
                <div className="font-medium">{revision.pageType.toLowerCase()} revision {revision.id}</div>
                <div className="muted">{revision.createdAt.toLocaleString("en-US")}</div>
              </div>
            ))}
            {revisions.length === 0 && <p className="muted">No edits yet.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}
