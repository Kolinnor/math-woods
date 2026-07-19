import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ExplorationReader, type ExplorationReaderBlock } from "@/components/ExplorationReader";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asExplorationState } from "@/lib/exploration-engine";
import { canEditExploration, canViewExploration } from "@/lib/explorations";
import { renderInlineMarkdown } from "@/lib/markdown";
import { canViewProblem } from "@/lib/problem-visibility";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function StartExplorationPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ block?: string }>;
}) {
  const { slug } = await params;
  const { block: requestedBlockKey } = await searchParams;
  const user = await getCurrentUser();
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      collaborators: true,
      pages: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          blocks: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              problem: { select: { slug: true, title: true, difficulty: true, authorId: true, qualityStatus: true } },
              concept: { select: { slug: true, title: true } },
              options: { orderBy: { position: "asc" } },
              outcomes: { include: { matches: true }, orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!exploration || !canViewExploration(user, exploration)) notFound();

  const isEditor = canEditExploration(user, exploration);
  const session = user ? await prisma.explorationSession.findUnique({
    where: { playlistId_userId: { playlistId: exploration.id, userId: user.id } },
    include: { answers: true }
  }) : null;
  const liveBlocks = exploration.pages.flatMap((page) => page.blocks.map((block) => ({ ...block, pageKey: page.key })));
  const readableBlocks = liveBlocks.filter((block) => !block.problem || canViewProblem(user, block.problem as never));
  const requestedBlock = readableBlocks.find((block) => block.key === requestedBlockKey);
  const resumedBlock = readableBlocks.find((block) => block.key === session?.currentBlockKey);
  const startBlock = readableBlocks.find((block) => block.isStart) ?? readableBlocks[0];
  const initialBlock = requestedBlock ?? resumedBlock ?? startBlock;
  if (!initialBlock) notFound();
  const readableByKey = new Map(readableBlocks.map((block) => [block.key, block]));
  const persistedPath = Array.isArray(session?.pathBlockKeys)
    ? session.pathBlockKeys.map(String).flatMap((key) => readableByKey.get(key) ?? [])
    : [];
  const initialPathIndex = persistedPath.findLastIndex((block) => block.id === initialBlock.id);
  const initialPathBlocks = initialPathIndex >= 0
    ? persistedPath.slice(0, initialPathIndex + 1)
    : [initialBlock];

  const blocks: ExplorationReaderBlock[] = await Promise.all(readableBlocks.map(async (block) => ({
    id: block.id,
    pageKey: block.pageKey,
    key: block.key,
    kind: block.kind,
    title: block.title,
    bodyHtml: block.bodyHtml,
    explanationHtml: block.explanationHtml,
    required: block.required,
    points: block.points,
    isStart: block.isStart,
    isEnd: block.isEnd,
    continueToBlockId: block.continueToBlockId,
    autoContinue: block.autoContinue,
    problem: block.problem ? {
      slug: block.problem.slug,
      titleHtml: await renderInlineMarkdown(block.problem.title),
      difficulty: block.problem.difficulty
    } : null,
    concept: block.concept,
    options: block.options.map((option) => ({ id: option.id, label: option.label, toBlockId: option.toBlockId })),
    outcomes: block.kind === "QUIZ"
      ? []
      : block.outcomes.map((outcome) => ({ id: outcome.id, label: outcome.label, toBlockId: outcome.toBlockId }))
  })));
  const initialVisitedBlockKeys = Array.isArray(session?.visitedBlockKeys)
    ? session.visitedBlockKeys.map(String)
    : [initialBlock.key];

  return (
    <ForestPageLayout
      title={exploration.title}
      eyebrow="Exploration"
      heroImage={exploration.coverImageUrl || "/art/playlists-forest-lodge.webp"}
      heroAlt={exploration.coverImageUrl ? `Cover for ${exploration.title}` : "Ivan Shishkin, Forest Lodge"}
      description={`by ${displayNameForUser(exploration.author)}`}
      workspaceClassName="forest-page-workspace-wide"
      actions={<Link href="/explorations" className="button secondary"><ArrowLeft size={16} /> Explorations</Link>}
    >
      <ExplorationReader
        playlistId={exploration.id}
        slug={exploration.slug}
        blocks={blocks}
        initialBlockId={initialBlock.id}
        initialPathBlockIds={initialPathBlocks.map((block) => block.id)}
        initialState={asExplorationState(session?.state)}
        initialVisitedBlockKeys={initialVisitedBlockKeys}
        initialAnswers={(session?.answers ?? []).map((answer) => ({ blockKey: answer.blockKey, response: answer.response, isCorrect: answer.isCorrect }))}
        signedIn={Boolean(user)}
        canEdit={isEditor}
      />
    </ForestPageLayout>
  );
}
