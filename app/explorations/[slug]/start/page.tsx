import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ExplorationReader } from "@/components/ExplorationReader";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asExplorationState, conditionMatches } from "@/lib/exploration-engine";
import { canEditExploration, canViewExploration } from "@/lib/explorations";
import type { ExplorationSnapshotPage } from "@/lib/exploration-snapshot";
import { renderInlineMarkdown } from "@/lib/markdown";
import { canViewProblem } from "@/lib/problem-visibility";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function StartExplorationPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; preview?: string }>;
}) {
  const { slug } = await params;
  const { page: requestedPageSlug, preview } = await searchParams;
  const user = await getCurrentUser();
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      collaborators: true,
      pages: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: {
              problem: { select: { slug: true, title: true, difficulty: true, authorId: true, qualityStatus: true } },
              concept: { select: { slug: true, title: true } },
              options: { orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });

  if (!exploration || !canViewExploration(user, exploration)) notFound();

  const isEditor = canEditExploration(user, exploration);
  const session = user
    ? await prisma.explorationSession.findUnique({
        where: { playlistId_userId: { playlistId: exploration.id, userId: user.id } },
        include: { answers: true }
      })
    : null;
  const draftPreview = isEditor && preview === "draft";
  const contentPages = exploration.pages as unknown as ExplorationSnapshotPage[];
  const initialState = asExplorationState(session?.state);
  const readablePages = contentPages.filter((page) => conditionMatches(page.visibilityRule, initialState));
  const requestedPage = readablePages.find((page) => page.slug === requestedPageSlug);
  const resumedPage = readablePages.find((page) =>
    session?.currentPageKey ? page.key === session.currentPageKey : page.id === session?.currentPageId
  );
  const startPage = readablePages.find((page) => page.isStart) ?? readablePages[0];
  const initialPage = requestedPage ?? resumedPage ?? startPage;
  if (!initialPage) notFound();

  const pages = await Promise.all(
    contentPages.map(async (page) => ({
      id: page.id,
      key: page.key,
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      position: page.position,
      isStart: page.isStart,
      isEnd: page.isEnd,
      visibilityRule: page.visibilityRule,
      blocks: await Promise.all(
        page.blocks.filter((block) => !block.problem || canViewProblem(user, block.problem as never)).map(async (block) => ({
          id: block.id,
          key: block.key,
          kind: block.kind,
          title: block.title,
          bodyHtml: block.bodyHtml,
          explanationHtml: null,
          position: block.position,
          quizType: block.quizType,
          visibilityRule: block.visibilityRule,
          required: block.required,
          points: block.points,
          problem: block.problem
            ? {
                slug: block.problem.slug,
                titleHtml: await renderInlineMarkdown(block.problem.title),
                difficulty: block.problem.difficulty
              }
            : null,
          concept: block.concept,
          options: block.options.map((option) => ({
            id: option.id,
            label: option.label,
            value: option.value,
            feedbackHtml: null,
            toPageId: option.toPageId
          }))
        }))
      )
    }))
  );
  const visitedKeys = Array.isArray(session?.visitedPageKeys) ? session.visitedPageKeys.map(String) : [];
  const initialVisited = visitedKeys.length
    ? contentPages.filter((page) => visitedKeys.includes(page.key)).map((page) => page.id)
    : Array.isArray(session?.visitedPageIds)
      ? session.visitedPageIds.map(Number).filter(Number.isInteger)
      : [initialPage.id];

  return (
    <ForestPageLayout
      title={exploration.title}
      eyebrow="Exploration"
      heroImage={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"}
      heroAlt={exploration.coverImageUrl ? `Cover for ${exploration.title}` : "Ivan Shishkin, Forest Lodge"}
      description={`by ${displayNameForUser(exploration.author)}`}
      workspaceClassName="forest-page-workspace-wide"
      actions={
        <Link href="/explorations" className="button secondary">
          <ArrowLeft size={16} /> Explorations
        </Link>
      }
    >
      <ExplorationReader
        playlistId={exploration.id}
        slug={exploration.slug}
        pages={pages}
        initialPageId={initialPage.id}
        initialState={initialState}
        initialVisited={initialVisited}
        initialAnswers={(session?.answers ?? []).map((answer) => ({
          blockKey: answer.blockKey,
          response: answer.response,
          isCorrect: answer.isCorrect
        }))}
        signedIn={Boolean(user)}
        previewDraft={draftPreview}
        canEdit={isEditor}
      />
    </ForestPageLayout>
  );
}
