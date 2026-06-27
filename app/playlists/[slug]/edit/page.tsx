import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { DeletePlaylistButton } from "@/components/DeletePlaylistButton";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { PlaylistCircuit } from "@/components/PlaylistCircuit";
import {
  addPlaylistChoiceAction,
  addPlaylistNodeAction,
  addProblemToPlaylistAction,
  deletePlaylistAction
} from "@/lib/actions/playlist-actions";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAdminister, canModerate } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function EditPlaylistPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ problemSearch?: string; conceptSearch?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { slug } = await params;
  const { problemSearch = "", conceptSearch = "" } = await searchParams;
  const playlist = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
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
  const canEdit = playlist.authorId === user.id || canModerate(user.role);
  const canDeletePlaylist = canAdminister(user.role);
  if (!canEdit) notFound();

  const problemQuery = problemSearch.trim();
  const conceptQuery = conceptSearch.trim();
  const [problemMatches, conceptMatches] = await Promise.all([
    prisma.problem.findMany({
      where: {
        status: "PUBLISHED",
        listed: true,
        language: playlist.language,
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
    }),
    prisma.concept.findMany({
      where: {
        language: playlist.language,
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
  ]);

  const circuitNodes = playlist.circuitNodes.map((node) => ({
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
  }));

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/playlists/${playlist.slug}`} className="button secondary inline-flex items-center gap-2">
          <ArrowLeft size={16} />
          Back to playlist
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Edit {playlist.title}</h1>
        <p className="muted mt-1">Manage the playlist circuit and reusable entries.</p>
      </div>

      {circuitNodes.length > 0 && <PlaylistCircuit nodes={circuitNodes} />}

      <section className="playlist-builder">
        <div className="playlist-builder-header">
          <div>
            <p className="eyebrow">Creator tools</p>
            <h2>Build this playlist</h2>
            <p className="muted">
              Search existing pages, add local steps, then connect the choices.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/problems/new?playlist=${playlist.slug}&listed=0&language=${playlist.language}`} className="button">
              Create playlist-specific problem
            </Link>
            <Link href={`/problems/new?playlist=${playlist.slug}&listed=1&language=${playlist.language}`} className="button secondary">
              Create reusable problem
            </Link>
            <Link href={`/concepts/new?title=${encodeURIComponent(playlist.title)}&language=${playlist.language}`} className="button secondary">
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

      {canDeletePlaylist && (
        <section className="danger-zone">
          <div>
            <h2>Delete playlist</h2>
            <p>This removes the playlist, its circuit, and its ordering. The problems themselves stay available.</p>
          </div>
          <form action={deletePlaylistAction.bind(null, playlist.id)}>
            <DeletePlaylistButton title={playlist.title} />
          </form>
        </section>
      )}
    </div>
  );
}
