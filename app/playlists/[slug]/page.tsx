import Link from "next/link";
import type { Route } from "next";
import { Bookmark, Pencil, Play, ThumbsUp } from "lucide-react";
import { notFound } from "next/navigation";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import {
  togglePlaylistFollowAction,
  votePlaylistAction
} from "@/lib/actions/playlist-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { problemLinkClass } from "@/lib/problem-link";
import { canModerate } from "@/lib/roles";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const playlist = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      items: {
        include: { problem: true },
        orderBy: { position: "asc" }
      },
      circuitNodes: {
        select: { id: true }
      }
    }
  });

  if (!playlist) notFound();

  const isEditor = Boolean(user && (user.id === playlist.authorId || canModerate(user.role)));
  const problemIds = playlist.items.map((item) => item.problemId);
  const [voteCount, ownVote, followerCount, following, solvedAttempts] = await Promise.all([
    prisma.vote.count({
      where: { targetType: "PLAYLIST", targetId: playlist.id }
    }),
    user
      ? prisma.vote.findUnique({
          where: { userId_targetType_targetId: { userId: user.id, targetType: "PLAYLIST", targetId: playlist.id } }
        })
      : null,
    prisma.playlistFollow.count({ where: { playlistId: playlist.id } }),
    user
      ? prisma.playlistFollow.findUnique({
          where: { userId_playlistId: { userId: user.id, playlistId: playlist.id } }
        })
      : null,
    user
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED", problemId: { in: problemIds } },
          select: { problemId: true }
        })
      : []
  ]);
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));
  const startHref = `/playlists/${playlist.slug}/start` as Route;
  const editHref = `/playlists/${playlist.slug}/edit` as Route;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{playlist.title}</h1>
            <p className="muted mt-1">playlist by {displayNameForUser(playlist.author)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={startHref} className="button">
              <Play size={17} />
              Start playlist
            </Link>
            {isEditor && (
              <Link href={editHref} className="button secondary">
                <Pencil size={17} />
                Edit
              </Link>
            )}
          </div>
        </div>

        <section className="panel p-6">
          <MarkdownBlock html={playlist.descriptionHtml} />
        </section>

        {playlist.circuitNodes.length > 0 && (
          <section className="panel mt-6 p-5">
            <p className="eyebrow">Adaptive path</p>
            <h2 className="text-xl font-semibold">This playlist has a guided route.</h2>
            <div className="mt-4">
              <Link href={startHref} className="button">
                <Play size={17} />
                Start playlist
              </Link>
            </div>
          </section>
        )}

        <section className="mt-6 grid gap-3">
          {playlist.items.map((item) => (
            <Link
              key={item.id}
              href={`/problems/${item.problem.slug}`}
              className={problemLinkClass("panel block p-4", solvedIds.has(item.problemId))}
            >
              <div className="flex gap-4">
                <span className="muted w-8 shrink-0 text-right">{item.position}.</span>
                <div>
                  <h2 className="font-semibold">{item.problem.title}</h2>
                  {item.noteMarkdown && <p className="muted mt-1 text-sm">{item.noteMarkdown}</p>}
                </div>
              </div>
            </Link>
          ))}
          {playlist.items.length === 0 && <p className="muted panel p-5">No problems in this playlist yet.</p>}
        </section>
      </article>

      <aside className="grid content-start gap-5">
        <section className="panel p-5">
          <form action={togglePlaylistFollowAction.bind(null, playlist.id, playlist.slug)} className="mb-3">
            <button type="submit" className="secondary w-full">
              <Bookmark size={17} fill={following ? "currentColor" : "none"} />
              {following ? "Following" : "Follow"} &middot; {followerCount}
            </button>
          </form>
          {user && (
            <p className="muted mb-3 text-sm">
              Progress: {solvedAttempts.length}/{playlist.items.length} solved
            </p>
          )}
          <form action={votePlaylistAction.bind(null, playlist.id)} className="grid gap-3">
            <button
              type="submit"
              className={ownVote ? "w-full vote-button-active" : "w-full"}
              aria-pressed={Boolean(ownVote)}
              title={ownVote ? "Remove vote" : "Vote for this playlist"}
            >
              <ThumbsUp size={17} />
              {ownVote ? "Remove vote" : "Vote"} &middot; {voteCount}
            </button>
            <Link href={`/playlists/${playlist.slug}/export`} className="button secondary">
              Export Markdown
            </Link>
          </form>
        </section>
      </aside>
    </div>
  );
}
