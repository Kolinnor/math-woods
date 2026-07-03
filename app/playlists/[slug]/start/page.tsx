import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { PlaylistCircuit } from "@/components/PlaylistCircuit";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { problemLinkClass } from "@/lib/problem-link";
import { renderInlineMarkdown } from "@/lib/markdown";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function StartPlaylistPage({ params }: { params: Promise<{ slug: string }> }) {
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

  const solvedAttempts = user
    ? await prisma.problemAttempt.findMany({
        where: {
          userId: user.id,
          status: "SOLVED",
          problemId: { in: playlist.items.map((item) => item.problemId) }
        },
        select: { problemId: true }
      })
    : [];
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));
  const circuitNodes = await Promise.all(
    playlist.circuitNodes.map(async (node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title ?? node.problem?.title ?? node.concept?.title ?? "Untitled step",
      bodyHtml: node.bodyHtml,
      position: node.position,
      isStart: node.isStart,
      problem: node.problem
        ? {
            ...node.problem,
            titleHtml: await renderInlineMarkdown(node.problem.title)
          }
        : null,
      concept: node.concept,
      choices: node.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        note: choice.note,
        toNodeId: choice.toNodeId
      }))
    }))
  );

  return (
    <ForestPageLayout
      title={playlist.title}
      eyebrow="Playlist route"
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      description={`playlist by ${displayNameForUser(playlist.author)}`}
      workspaceClassName="forest-page-workspace-narrow"
      actions={
        <Link href={`/playlists/${playlist.slug}`} className="button secondary inline-flex items-center gap-2">
          <ArrowLeft size={16} />
          Back to playlist
        </Link>
      }
    >
      {playlist.circuitNodes.length > 0 ? (
        <PlaylistCircuit nodes={circuitNodes} />
      ) : (
        <section className="grid gap-3">
          {playlist.items.map((item) => (
            <Link
              key={item.id}
              href={`/problems/${item.problem.slug}`}
              className={problemLinkClass("panel block p-4", solvedIds.has(item.problemId))}
            >
              <div className="flex gap-4">
                <span className="muted w-8 shrink-0 text-right">{item.position}.</span>
                <div>
                  <h2 className="font-semibold">
                    <AsyncMarkdownInline markdown={item.problem.title} />
                  </h2>
                  {item.noteMarkdown && <p className="muted mt-1 text-sm">{item.noteMarkdown}</p>}
                </div>
              </div>
            </Link>
          ))}
          {playlist.items.length === 0 && <p className="muted panel p-5">No problems in this playlist yet.</p>}
        </section>
      )}
    </ForestPageLayout>
  );
}
