import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ExplorationReader, type ExplorationReaderBlock } from "@/components/ExplorationReader";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { UserName } from "@/components/UserName";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asExplorationState } from "@/lib/exploration-engine";
import { canEditExploration, canViewExploration } from "@/lib/explorations";
import { renderInlineMarkdown } from "@/lib/markdown";
import { canViewProblem } from "@/lib/problem-visibility";
import { visibleProblemWhere } from "@/lib/problem-visibility";
import {
  resolveConceptLinksForLanguage,
  resolveConceptTitlesForLanguage,
  resolveProblemLinksForLanguage
} from "@/lib/translated-markdown";

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
              problem: {
                select: {
                  slug: true,
                  title: true,
                  difficulty: true,
                  listed: true,
                  language: true,
                  translationGroupId: true,
                  authorId: true,
                  qualityStatus: true,
                  status: true
                }
              },
              concept: { select: { slug: true, title: true, language: true } },
              problemGroups: {
                orderBy: { position: "asc" },
                include: {
                  problems: {
                    orderBy: { position: "asc" },
                    include: {
                      problem: {
                        select: {
                          slug: true,
                          title: true,
                          difficulty: true,
                          listed: true,
                          language: true,
                          translationGroupId: true,
                          authorId: true,
                          qualityStatus: true,
                          status: true
                        }
                      }
                    }
                  }
                }
              },
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
  type VisibleProblem = NonNullable<(typeof readableBlocks)[number]["problem"]>;
  type VisibleProblemGroup = {
    id: number;
    title: string;
    problems: Array<{ id: number; problem: VisibleProblem }>;
  };
  const visibleProblemGroupsByBlockId = new Map<number, VisibleProblemGroup[]>();
  for (const block of readableBlocks) {
    const groups: VisibleProblemGroup[] = block.problemGroups
      .map((group) => ({
        id: group.id,
        title: group.title,
        problems: group.problems.filter(({ problem }) =>
          problem.status !== "ARCHIVED" && canViewProblem(user, problem)
        )
      }))
      .filter((group) => group.problems.length > 0);
    if (groups.length === 0 && block.problem && block.problem.status !== "ARCHIVED") {
      groups.push({ id: -block.id, title: "Problems", problems: [{ id: -block.id, problem: block.problem }] });
    }
    visibleProblemGroupsByBlockId.set(block.id, groups);
  }
  const visibleProblemTranslationGroups = Array.from(new Set(
    Array.from(visibleProblemGroupsByBlockId.values()).flatMap((groups) =>
      groups.flatMap((group) => group.problems.map(({ problem }) => problem.translationGroupId))
    )
  ));
  const visibleProblemSlugs = Array.from(new Set(
    Array.from(visibleProblemGroupsByBlockId.values()).flatMap((groups) =>
      groups.flatMap((group) => group.problems.map(({ problem }) => problem.slug))
    )
  ));
  const visibleConceptSlugs = Array.from(new Set(
    readableBlocks.flatMap((block) => block.concept ? [block.concept.slug] : [])
  ));
  const [problemLinkBySlug, conceptLinkBySlug, conceptTitleBySlug] = await Promise.all([
    resolveProblemLinksForLanguage(visibleProblemSlugs, exploration.language, {
      status: { not: "ARCHIVED" },
      ...visibleProblemWhere(user)
    }),
    resolveConceptLinksForLanguage(visibleConceptSlugs, exploration.language),
    resolveConceptTitlesForLanguage(visibleConceptSlugs, exploration.language)
  ]);
  const solvedAttempts = user && visibleProblemTranslationGroups.length > 0
    ? await prisma.problemAttempt.findMany({
        where: {
          userId: user.id,
          status: "SOLVED",
          problem: { translationGroupId: { in: visibleProblemTranslationGroups } }
        },
        select: { problem: { select: { translationGroupId: true } } }
      })
    : [];
  const solvedProblemGroups = new Set(solvedAttempts.map((attempt) => attempt.problem.translationGroupId));
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
      slug: problemLinkBySlug.get(block.problem.slug)?.slug ?? block.problem.slug,
      titleHtml: await renderInlineMarkdown(problemLinkBySlug.get(block.problem.slug)?.title ?? block.problem.title),
      difficulty: problemLinkBySlug.get(block.problem.slug)?.difficulty ?? block.problem.difficulty
    } : null,
    problemGroups: await Promise.all((visibleProblemGroupsByBlockId.get(block.id) ?? []).map(async (group) => ({
      id: group.id,
      title: group.title,
      problems: await Promise.all(group.problems.map(async ({ id, problem }) => ({
        id,
        slug: problemLinkBySlug.get(problem.slug)?.slug ?? problem.slug,
        titleHtml: await renderInlineMarkdown(problemLinkBySlug.get(problem.slug)?.title ?? problem.title),
        difficulty: problemLinkBySlug.get(problem.slug)?.difficulty ?? problem.difficulty,
        listed: problem.listed,
        language: problemLinkBySlug.get(problem.slug)?.language ?? problem.language,
        solved: solvedProblemGroups.has(problem.translationGroupId)
      })))
    }))),
    concept: block.concept ? {
      slug: conceptLinkBySlug.get(block.concept.slug)?.href.split("/").at(-1) ?? block.concept.slug,
      titleHtml: await renderInlineMarkdown(conceptTitleBySlug.get(block.concept.slug) ?? block.concept.title),
      language: conceptLinkBySlug.get(block.concept.slug)?.language ?? block.concept.language
    } : null,
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
      description={<span>by <UserName user={exploration.author} /></span>}
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
        contentLanguage={exploration.language}
        canEdit={isEditor}
      />
    </ForestPageLayout>
  );
}
