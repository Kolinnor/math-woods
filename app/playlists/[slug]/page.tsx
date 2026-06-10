import Link from "next/link";
import { Bookmark } from "lucide-react";
import { notFound } from "next/navigation";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { PlaylistCircuit } from "@/components/PlaylistCircuit";
import {
  addPlaylistChoiceAction,
  addPlaylistNodeAction,
  addProblemToPlaylistAction,
  togglePlaylistFollowAction,
  votePlaylistAction
} from "@/lib/actions/playlist-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { problemLinkClass } from "@/lib/problem-link";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ problemSearch?: string; conceptSearch?: string }>;
}) {
  const { slug } = await params;
  const { problemSearch = "", conceptSearch = "" } = await searchParams;
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
        include: {
          problem: { select: { slug: true, title: true, difficulty: true } },
          concept: { select: { slug: true, title: true } },
          choices: { orderBy: { position: "asc" } }
        },
        orderBy: { position: "asc" }
      }
    }
  });

  if (!playlist) notFound();

  const isEditor = Boolean(
    user && (user.id === playlist.authorId || user.role === "MODERATOR" || user.role === "ADMIN")
  );
  const problemIds = playlist.items.map((item) => item.problemId);
  const problemQuery = problemSearch.trim();
  const conceptQuery = conceptSearch.trim();
  const [voteCount, followerCount, following, solvedAttempts, problemMatches, conceptMatches] = await Promise.all([
    prisma.vote.count({
      where: { targetType: "PLAYLIST", targetId: playlist.id }
    }),
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
    ,
    isEditor
      ? prisma.problem.findMany({
          where: {
            status: "PUBLISHED",
            listed: true,
            ...(problemQuery
              ? {
                  OR: [
                    { title: { contains: problemQuery, mode: "insensitive" } },
                    { bodyMarkdown: { contains: problemQuery, mode: "insensitive" } },
                    { origin: { contains: problemQuery, mode: "insensitive" } }
                  ]
                }
              : {})
          },
          orderBy: { updatedAt: "desc" },
          take: 8
        })
      : [],
    isEditor
      ? prisma.concept.findMany({
          where: {
            ...(conceptQuery
              ? {
                  OR: [
                    { title: { contains: conceptQuery, mode: "insensitive" } },
                    { bodyMarkdown: { contains: conceptQuery, mode: "insensitive" } },
                    { aliases: { some: { alias: { contains: conceptQuery, mode: "insensitive" } } } }
                  ]
                }
              : {})
          },
          orderBy: { updatedAt: "desc" },
          take: 8
        })
      : []
  ]);
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="mb-5">
          <h1 className="text-3xl font-bold">{playlist.title}</h1>
          <p className="muted mt-1">by @{playlist.author.username}</p>
        </div>

        <section className="panel p-6">
          <MarkdownBlock html={playlist.descriptionHtml} />
        </section>

        {playlist.circuitNodes.length > 0 && (
          <div className="mt-6">
            <PlaylistCircuit
              nodes={playlist.circuitNodes.map((node) => ({
                id: node.id,
                kind: node.kind,
                title: node.title ?? node.problem?.title ?? node.concept?.title ?? "Untitled step",
                bodyHtml: node.bodyHtml,
                position: node.position,
                isStart: node.isStart,
                problem: node.problem,
                concept: node.concept,
                choices: node.choices.map((choice) => ({
                  id: choice.id,
                  label: choice.label,
                  note: choice.note,
                  toNodeId: choice.toNodeId
                }))
              }))}
            />
          </div>
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
              {following ? "Following" : "Follow"} · {followerCount}
            </button>
          </form>
          {user && (
            <p className="muted mb-3 text-sm">
              Progress: {solvedAttempts.length}/{playlist.items.length} solved
            </p>
          )}
          <form action={votePlaylistAction.bind(null, playlist.id)}>
            <button type="submit" className="w-full">
              Vote · {voteCount}
            </button>
          </form>
          <Link href={`/playlists/${playlist.slug}/export`} className="button secondary">
            Export Markdown
          </Link>
        </section>

      </aside>

      {isEditor && (
        <section className="playlist-builder lg:col-span-2">
          <div className="playlist-builder-header">
            <div>
              <p className="eyebrow">Creator tools</p>
              <h2>Build this playlist</h2>
              <p className="muted">
                Search existing pages, add local steps, then connect the choices.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/problems/new?playlist=${playlist.slug}&listed=0`} className="button">
                Create playlist-specific problem
              </Link>
              <Link href={`/problems/new?playlist=${playlist.slug}&listed=1`} className="button secondary">
                Create reusable problem
              </Link>
              <Link href={`/concepts/new?title=${encodeURIComponent(playlist.title)}`} className="button secondary">
                Create concept
              </Link>
            </div>
          </div>

          <div className="playlist-builder-grid">
            <section className="builder-panel">
              <h3>Add existing problem</h3>
              <LiveSearchForm className="builder-search">
                <input
                  name="problemSearch"
                  defaultValue={problemQuery}
                  placeholder="Search problems by title, statement, or origin"
                />
                {conceptQuery && <input type="hidden" name="conceptSearch" value={conceptQuery} />}
                <button type="submit">Search</button>
              </LiveSearchForm>
              <div className="builder-results">
                {problemMatches.map((problem) => (
                  <form key={problem.id} action={addProblemToPlaylistAction.bind(null, playlist.id)} className="builder-result">
                    <input type="hidden" name="problemSlug" value={problem.slug} />
                    <div>
                      <strong>{problem.title}</strong>
                      <span>{problem.difficulty ? `difficulty ${problem.difficulty}/100` : "difficulty unset"}</span>
                    </div>
                    <button type="submit" className="secondary">Add</button>
                  </form>
                ))}
                {problemMatches.length === 0 && <p className="muted text-sm">No reusable problems found.</p>}
              </div>
            </section>

            <section className="builder-panel">
              <h3>Find concepts</h3>
              <LiveSearchForm className="builder-search">
                {problemQuery && <input type="hidden" name="problemSearch" value={problemQuery} />}
                <input
                  name="conceptSearch"
                  defaultValue={conceptQuery}
                  placeholder="Search concepts"
                />
                <button type="submit">Search</button>
              </LiveSearchForm>
              <div className="builder-results">
                {conceptMatches.map((concept) => (
                  <form key={concept.id} action={addPlaylistNodeAction.bind(null, playlist.id, playlist.slug)} className="builder-result">
                    <input type="hidden" name="kind" value="CONCEPT" />
                    <input type="hidden" name="conceptSlug" value={concept.slug} />
                    <div>
                      <strong>{concept.title}</strong>
                      <span>{concept.status.toLowerCase()}</span>
                    </div>
                    <button type="submit" className="secondary">Add step</button>
                  </form>
                ))}
                {conceptMatches.length === 0 && <p className="muted text-sm">No concepts found.</p>}
              </div>
            </section>
          </div>

          <div className="playlist-builder-grid">
            <section className="builder-panel">
              <h3>Add circuit step</h3>
              <form action={addPlaylistNodeAction.bind(null, playlist.id, playlist.slug)} className="builder-form">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Step type</span>
                    <select name="kind" defaultValue="PROBLEM">
                      <option value="PROBLEM">Problem</option>
                      <option value="CONCEPT">Concept</option>
                      <option value="NOTE">Note</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Problem slug</span>
                    <input name="problemSlug" placeholder="roots-and-coefficients" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Concept slug</span>
                    <input name="conceptSlug" placeholder="polynomial" />
                  </label>
                </div>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Title override</span>
                  <input name="title" placeholder="Optional, unless this is a note" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Step note</span>
                  <LazyMarkdownEditor name="bodyMarkdown" minHeight="8rem" lineNumbers={false} />
                </label>
                <label className="checkbox-field">
                  <input name="isStart" type="checkbox" />
                  <span>
                    <strong>Use as starting step</strong>
                    <small>The first step is automatically the start unless you choose another one.</small>
                  </span>
                </label>
                <button type="submit" className="secondary">Add circuit step</button>
              </form>
            </section>

            <section className="builder-panel">
              <h3>Add circuit choice</h3>
              {playlist.circuitNodes.length >= 2 ? (
                <form action={addPlaylistChoiceAction.bind(null, playlist.id, playlist.slug)} className="builder-form">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">From</span>
                    <select name="fromNodeId">
                      {playlist.circuitNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.position}. {node.title ?? node.problem?.title ?? node.concept?.title ?? "Untitled step"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Button text</span>
                    <input name="label" placeholder="I understood" required />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Send to</span>
                    <select name="toNodeId">
                      {playlist.circuitNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.position}. {node.title ?? node.problem?.title ?? node.concept?.title ?? "Untitled step"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Optional small note</span>
                    <input name="note" placeholder="Good, try a harder variant." />
                  </label>
                  <button type="submit" className="secondary">Add choice</button>
                </form>
              ) : (
                <p className="muted text-sm">Add at least two steps before wiring choices.</p>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
