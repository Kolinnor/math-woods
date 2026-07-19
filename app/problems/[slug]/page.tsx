import { ProblemVerificationMode } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { TargetType } from "@prisma/client";
import { NotificationType } from "@prisma/client";
import { QualityStatus } from "@prisma/client";
import { Check, Heart, House, MessageSquare, Pencil, ThumbsUp } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentTranslations } from "@/components/ContentTranslations";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ProblemHintReveal } from "@/components/ProblemHintReveal";
import { reportProblemAction } from "@/lib/actions/moderation-actions";
import {
  dismissProblemTranslationStaleNoticeAction,
  markProblemGoodAction,
  markProblemSolvedAction,
  startAttemptAction,
  toggleProblemFavoriteAction,
  unmarkProblemSolvedAction
} from "@/lib/actions/problem-actions";
import {
  createProofAction,
  voteProofAction
} from "@/lib/actions/proof-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { contentLanguageLabel } from "@/lib/languages";
import { getTranslations } from "@/lib/i18n/server";
import { markdownExcerpt } from "@/lib/metadata-text";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import {
  canEditProblem,
  canEditSolution,
  canSetProblemQualityStatus,
  canUseAdminTools,
  canViewArchivedProblem
} from "@/lib/permissions";
import { heroArtForProblemDomain } from "@/lib/problem-hero-art";
import { canViewProblem, visibleProblemWhere } from "@/lib/problem-visibility";
import { COMMUNITY_ACCEPTED_PROOF_VOTES } from "@/lib/problems";
import { problemLinkClass } from "@/lib/problem-link";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { renderMarkdownForContentLanguage, resolveConceptHrefsForLanguage } from "@/lib/translated-markdown";
import { problemTranslationFreshness } from "@/lib/translation-freshness";
import {
  nextMissingTranslationLanguage,
  preferredTranslationForLanguage,
  requestedTranslationLanguage,
  TRANSLATION_VIEW_LANGUAGE_PARAM
} from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      bodyMarkdown: true,
      translationGroupId: true,
      qualityStatus: true
    }
  });
  if (!problem || problem.qualityStatus === QualityStatus.UNREVIEWED) return {};

  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { slug: true, language: true }
  });
  const description = markdownExcerpt(problem.bodyMarkdown, "A Math Woods problem.");

  return {
    title: `${problem.title} - Math Woods`,
    description,
    alternates: {
      canonical: `/problems/${problem.slug}`,
      languages: Object.fromEntries(
        translations.map((translation) => [translation.language, `/problems/${translation.slug}`])
      )
    },
    openGraph: {
      title: problem.title,
      description,
      url: `/problems/${problem.slug}`,
      siteName: "Math Woods",
      type: "article"
    },
    twitter: {
      card: "summary",
      title: problem.title,
      description
    }
  };
}

function difficultyColor(difficulty: number | null) {
  if (!difficulty) return "#8a9184";
  if (difficulty <= 19) return "#5d7a4c";
  if (difficulty <= 39) return "#a07a2c";
  if (difficulty <= 64) return "#b05f2c";
  return "#8c3b22";
}

function difficultyBars(difficulty: number | null) {
  if (!difficulty) return 0;
  if (difficulty <= 19) return 1;
  if (difficulty <= 39) return 2;
  if (difficulty <= 64) return 3;
  return 4;
}

function verificationStatusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function ProblemPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ solution?: string; verification?: string; viewLanguage?: string }>;
}) {
  const { slug } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const user = await getCurrentUser();
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      domains: { orderBy: { position: "asc" } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      thread: {
        include: {
          posts: {
            where: { deletedAt: null },
            select: { id: true },
            orderBy: { createdAt: "asc" }
          }
        }
      },
      proofs: {
        include: {
          author: true
        },
        orderBy: { createdAt: "asc" }
      },
      relatedGroups: {
        include: {
          relations: {
            include: { targetProblem: { include: { author: true } } },
            orderBy: { position: "asc" }
          }
        },
        orderBy: { position: "asc" }
      },
      translatedFromProblem: {
        select: { id: true, slug: true, title: true, language: true, authorId: true }
      }
    }
  });

  if (!problem) notFound();
  const isOwnProblem = user?.id === problem.authorId;
  const canViewArchived = canViewArchivedProblem(user, problem);
  if (problem.status === "ARCHIVED" && !canViewArchived) notFound();
  if (!canViewProblem(user, problem)) notFound();
  if (user) {
    await markNotificationsReadForHref(user.id, `/problems/${problem.slug}`, [
      NotificationType.PROOF_ADDED,
      NotificationType.PROBLEM_SOLVED,
      NotificationType.PROBLEM_CREATED
    ]);
  }
  const hasSpecifiedOrigin =
    problem.origin.trim().toLowerCase() !== "unknown" ||
    Boolean(problem.originChapter || problem.originPage || problem.originNote);

  const proofIds = problem.proofs.map((proof) => proof.id);
  const relatedProblems = problem.relatedGroups.flatMap((group) =>
    group.relations.map((relation) => relation.targetProblem)
  ).filter((targetProblem) => canViewProblem(user, targetProblem));
  const proofVoteGroupsPromise = proofIds.length
    ? prisma.vote.groupBy({
        by: ["targetId"],
        where: { targetType: "PROOF", targetId: { in: proofIds } },
        _count: { targetId: true }
      })
    : Promise.resolve([]);
  const [
    translations,
    links,
    attemptsInTranslationGroup,
    playlists,
    ownVerificationRequests,
    pendingVerificationRequests,
    proofVoteGroups,
    userVotes,
    favorite,
    groupFavoriteRows,
    relatedSolvedAttempts
  ] = await Promise.all([
    prisma.problem.findMany({
      where: {
        translationGroupId: problem.translationGroupId,
        id: { not: problem.id },
        ...visibleProblemWhere(user),
        ...(canViewArchived ? {} : { status: { not: "ARCHIVED" } })
      },
      select: { slug: true, title: true, language: true },
      orderBy: { language: "asc" }
    }),
    prisma.internalLink.findMany({
      where: { sourceType: "PROBLEM", sourceId: problem.id },
      orderBy: { targetSlug: "asc" }
    }),
    user
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, problem: { translationGroupId: problem.translationGroupId } },
          orderBy: { discussionUnlockAt: "asc" }
        })
      : Promise.resolve([]),
    prisma.playlistItem.findMany({
      where: { problemId: problem.id },
      include: { playlist: true },
      take: 6
    }),
    user
      ? prisma.problemVerificationRequest.findMany({
          where: { problemId: problem.id, userId: user.id },
          include: {
            messages: {
              include: { author: { select: { username: true, displayName: true } } },
              orderBy: { createdAt: "asc" }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 3
        })
      : Promise.resolve([]),
    user?.id === problem.authorId
      ? prisma.problemVerificationRequest.findMany({
          where: { problemId: problem.id, status: "PENDING" },
          include: {
            user: { select: { username: true, displayName: true } },
            messages: {
              include: { author: { select: { username: true, displayName: true } } },
              orderBy: { createdAt: "asc" }
            }
          },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve([]),
    proofVoteGroupsPromise,
    user && proofIds.length
      ? prisma.vote.findMany({
          where: {
            userId: user.id,
            targetType: TargetType.PROOF,
            targetId: { in: proofIds }
          },
          select: { targetType: true, targetId: true }
        })
      : Promise.resolve([]),
    user && !isOwnProblem
      ? prisma.problemFavorite.findFirst({
          where: { userId: user.id, problem: { translationGroupId: problem.translationGroupId } }
        })
      : null,
    prisma.problemFavorite.findMany({
      where: {
        userId: { not: problem.authorId },
        problem: { translationGroupId: problem.translationGroupId }
      },
      distinct: ["userId"],
      select: { userId: true }
    }),
    user && relatedProblems.length
      ? prisma.problemAttempt.findMany({
          where: {
            userId: user.id,
            status: "SOLVED",
            problem: {
              translationGroupId: { in: relatedProblems.map((relatedProblem) => relatedProblem.translationGroupId) }
            }
          },
          select: { problem: { select: { translationGroupId: true } } }
        })
      : Promise.resolve([])
  ]);
  const attempt =
    attemptsInTranslationGroup.find((translationAttempt) => translationAttempt.status === "SOLVED") ??
    attemptsInTranslationGroup[0] ??
    null;
  const favoriteCount = groupFavoriteRows.length;
  const requestedLanguage = requestedTranslationLanguage(queryParams.viewLanguage);
  const targetViewLanguage = requestedLanguage ?? preferredLanguage;
  const preferredTranslation = preferredTranslationForLanguage(problem.language, translations, targetViewLanguage);
  if (preferredTranslation?.slug && preferredTranslation.slug !== problem.slug) {
    const viewLanguageQuery = requestedLanguage
      ? `?${TRANSLATION_VIEW_LANGUAGE_PARAM}=${encodeURIComponent(requestedLanguage)}`
      : "";
    redirect(`/problems/${preferredTranslation.slug}${viewLanguageQuery}`);
  }
  const [problemBodyHtml, translationFreshness, linkedConceptHrefBySlug] = await Promise.all([
    renderMarkdownForContentLanguage(problem.bodyMarkdown, problem.language),
    problemTranslationFreshness(problem.translatedFromProblem, problem.translatedFromRevisionId),
    resolveConceptHrefsForLanguage(
      links.filter((link) => link.exists).map((link) => link.targetSlug),
      problem.language
    )
  ]);
  const isLanguageFallback = targetViewLanguage !== problem.language;

  const proofVotes = new Map(proofVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const ownProofVoteIds = new Set(userVotes.filter((vote) => vote.targetType === TargetType.PROOF).map((vote) => vote.targetId));
  const relatedSolvedGroupIds = new Set(
    relatedSolvedAttempts.map((attempt) => attempt.problem.translationGroupId)
  );
  const relatedSolvedIds = new Set(
    relatedProblems
      .filter((relatedProblem) => relatedSolvedGroupIds.has(relatedProblem.translationGroupId))
      .map((relatedProblem) => relatedProblem.id)
  );
  const proofs = [...problem.proofs].sort(
    (a, b) => (proofVotes.get(b.id) ?? 0) - (proofVotes.get(a.id) ?? 0) || a.createdAt.getTime() - b.createdAt.getTime()
  );
  const ownProofResetSignal = user ? problem.proofs.filter((proof) => proof.authorId === user.id).at(-1)?.id ?? 0 : 0;
  const acceptedProofId =
    proofs.length > 0 && (proofVotes.get(proofs[0].id) ?? 0) >= COMMUNITY_ACCEPTED_PROOF_VOTES ? proofs[0].id : null;
  const isConjecture = problem.tags.some(({ tag }) => tag.slug === "conjecture");
  const visibleRelatedGroups = problem.relatedGroups
    .map((group) => ({
      ...group,
      relations: group.relations.filter(
        (relation) => relation.targetProblem.status !== "ARCHIVED" && canViewProblem(user, relation.targetProblem)
      )
    }))
    .filter((group) => group.relations.length > 0);
  const isProblemAuthor = Boolean(user && problem.authorId === user.id);
  const canEditCurrentProblem = Boolean(user && canEditProblem(user, problem));
  const requiresSolutionVerification = problem.verificationMode !== ProblemVerificationMode.NONE;
  const canViewSolutions = !requiresSolutionVerification || attempt?.status === "SOLVED" || canEditCurrentProblem;
  const discussionVisible = Boolean(attempt || canEditCurrentProblem);
  const discussionPostCount = problem.thread?.posts.length ?? 0;
  const revealSpoilerDetails = attempt?.status === "SOLVED" || isProblemAuthor;
  const showSpoilerTags = problem.spoilerTags.length > 0 && revealSpoilerDetails;
  const problemDomains = problem.domains.length
    ? problem.domains.filter((item) => revealSpoilerDetails || !item.spoiler).map((item) => item.mscCode)
    : [problem.domain];
  const hiddenDomainCount = revealSpoilerDetails ? 0 : problem.domains.filter((item) => item.spoiler).length;
  const targetTranslationLanguage = nextMissingTranslationLanguage(problem.language, translations, targetViewLanguage);
  const addTranslationHref = targetTranslationLanguage
    ? `/problems/${problem.slug}/translate?language=${targetTranslationLanguage}`
    : undefined;
  const canManageTranslationFreshness = Boolean(
    user &&
      translationFreshness?.stale &&
      problem.translatedFromProblem &&
      (problem.translatedFromProblem.authorId === user.id || canUseAdminTools(user))
  );
  const verificationMessage =
    queryParams.verification === "incorrect" ? t.problemDetail.verificationIncorrect : null;
  const heroDomain = problemDomains[0] ?? (problem.domains.length ? "other" : problem.domain);
  const heroImage = heroArtForProblemDomain(heroDomain);
  const difficultyTone = difficultyColor(problem.difficulty ?? null);
  const difficultyLevel = difficultyBars(problem.difficulty ?? null);

  return (
    <div className="problem-detail-shell">
      <section className="problem-hero">
        <img src={heroImage.src} alt={heroImage.alt} />
        <div className="problem-hero-overlay" />
        <div className="problem-hero-inner">
          <div>
            <h1>
              <AsyncMarkdownInline markdown={problem.title} />
            </h1>
            <p className="problem-hero-byline">
              {t.problemDetail.by} <Link href={`/profile/${problem.author.username}`}>{displayNameForUser(problem.author)}</Link>
            </p>
          </div>
          <div className="problem-hero-meta">
            <p>{t.quality[problem.qualityStatus]}</p>
            {hiddenDomainCount > 0 && problemDomains.length > 0 && <p>{t.problemDetail.spoilerDomainHiddenUntilSolved}</p>}
            {!problem.listed && <p>{t.problemDetail.playlistSpecific}</p>}
          </div>
        </div>
      </section>

      <div className="problem-detail-body">
        <article className="problem-detail-article">
        {verificationMessage && (
          <p className="quality-banner quality-needs-work mb-4" role="status">
            {verificationMessage}
          </p>
        )}

          {isLanguageFallback && (
            <p className="quality-banner quality-unreviewed mb-4 text-sm">
              {t.translations.fallbackNotice(contentLanguageLabel(problem.language), contentLanguageLabel(targetViewLanguage))}
              {addTranslationHref && (
                <>
                  {" "}
                  <Link href={addTranslationHref as never} className="underline">
                    {t.translations.addThatTranslation}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          {translationFreshness?.stale && (
            <div className="quality-banner quality-needs-work translation-stale-banner mb-4 text-sm">
              <span>{t.translations.staleNotice(translationFreshness.basedOnRevisionId)}</span>
              {canManageTranslationFreshness && (
                <>
                  <Link href={translationFreshness.sourceHref as never} className="underline">
                    {t.translations.compareWith(translationFreshness.sourceTitle)}
                  </Link>
                  <form action={dismissProblemTranslationStaleNoticeAction.bind(null, problem.id)}>
                    <button type="submit" className="secondary translation-stale-dismiss">
                      {t.translations.dismiss}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
          <nav className="tab-nav problem-tab-nav">
            <span>{t.problemDetail.problem}</span>
            <Link href={`/problems/${problem.slug}/discussion`}>
              {t.problemDetail.discussions} · {t.problemDetail.messages(discussionPostCount)}
            </Link>
            <Link href={`/problems/${problem.slug}/history`}>
              {t.conceptDetail.history}
            </Link>
            <ContentTranslations
              currentLanguage={problem.language}
              hrefPrefix="/problems"
              translations={translations}
              addTranslationLabel={t.translations.addTranslation}
              createHref={addTranslationHref}
            />
          </nav>
          {problem.tags.length > 0 && (
            <div className="problem-detail-tags zen-meta">
              {problem.tags.map(({ tag }) => (
                <Link key={tag.id} href={`/problems?tag=${tag.slug}`} className="tag">
                  {tag.name}
                </Link>
              ))}
            </div>
          )}
          {showSpoilerTags && (
            <div className="problem-detail-tags zen-meta">
              <span className="meta">{t.problems.spoiler}</span>
              {problem.spoilerTags.map(({ tag }) => (
                <Link
                  key={tag.id}
                  href={`/problems?tag=${tag.slug}&includeSpoilerTags=1`}
                  className="tag spoiler-tag"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          )}

        {(problem.qualityStatus === "UNREVIEWED" || problem.qualityStatus === "NEEDS_WORK") && (
          <div
            className={
              problem.qualityStatus === "NEEDS_WORK"
                ? "zen-hide quality-banner quality-banner-compact quality-needs-work mb-4"
                : "zen-hide quality-banner quality-banner-compact quality-unreviewed mb-4"
            }
          >
            <strong>{t.quality[problem.qualityStatus]}.</strong>{" "}
            {problem.qualityStatus === "NEEDS_WORK"
              ? t.problemDetail.needsWorkNotice
              : t.problemDetail.unreviewedNotice}
            {user && canSetProblemQualityStatus(user.role, QualityStatus.GOOD) && (
              <form action={markProblemGoodAction.bind(null, problem.id, problem.slug)} className="mt-2">
                <button type="submit" className="secondary">
                  {t.problemDetail.markGoodEnough}
                </button>
              </form>
            )}
          </div>
        )}

        <section className="problem-statement reading-surface">
          <MarkdownBlock html={problemBodyHtml} />
        </section>
        {hasSpecifiedOrigin && (
          <div className="problem-origin-note zen-meta">
            {problem.origin.trim().toLowerCase() !== "unknown" && <span>{t.problemDetail.origin} {problem.origin}</span>}
            {(problem.originChapter || problem.originPage || problem.originNote) && (
              <details>
                <summary>{t.problemDetail.details}</summary>
                <div className="grid gap-1 pt-2">
                  {problem.originChapter && <p>{t.problemDetail.chapterOrSection} {problem.originChapter}</p>}
                  {problem.originPage && <p>{t.problemDetail.pageOrProblemNumber} {problem.originPage}</p>}
                  {problem.originNote && <p className="whitespace-pre-wrap">{problem.originNote}</p>}
                </div>
              </details>
            )}
          </div>
        )}

        <section className="zen-hide related-problems-section mt-8">
          <details>
            <summary>
              <span>{t.problemDetail.showRelatedProblems}</span>
              <span>{visibleRelatedGroups.reduce((count, group) => count + group.relations.length, 0)}</span>
            </summary>
            <div className="grid gap-5 pt-4">
              {visibleRelatedGroups.length > 0 ? (
                visibleRelatedGroups.map((group) => (
                  <div key={group.id} className="related-problem-group">
                    <h2>{group.title}</h2>
                    <div className="grid gap-2">
                      {group.relations.map(({ id, targetProblem }) => (
                        <Link
                          key={id}
                          href={`/problems/${targetProblem.slug}`}
                          className={problemLinkClass(
                            "related-problem-link block",
                            relatedSolvedIds.has(targetProblem.id)
                          )}
                        >
                          <strong>
                            <AsyncMarkdownInline markdown={targetProblem.title} />
                          </strong>
                          <span>
                            {t.problemDetail.by} {displayNameForUser(targetProblem.author)}
                            {targetProblem.difficulty ? ` \u00b7 ${t.problemDetail.difficulty.toLowerCase()} ${targetProblem.difficulty}/100` : ""}
                            {!targetProblem.listed ? ` \u00b7 ${t.problemDetail.playlistSpecific.toLowerCase()}` : ""}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">{t.problemDetail.noRelatedProblems}</p>
              )}
              {canEditCurrentProblem && (
                <div className="related-problem-actions">
                  <Link href={`/problems/new?parent=${problem.slug}&listed=0&language=${problem.language}`} className="button">
                    {t.problemDetail.createSpecificProblem}
                  </Link>
                  <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
                    {t.problemDetail.editRelatedProblems}
                  </Link>
                </div>
              )}
            </div>
          </details>
        </section>

        <section className="zen-hide proof-section mt-8">
          <div className="section-heading">
            <h2>{t.problemDetail.solutions}</h2>
            <span>{proofs.length}</span>
          </div>
          {isConjecture && proofs.length === 0 && (
            <p className="quality-banner quality-stub">{t.problemDetail.conjectureNoSolution}</p>
          )}
          {problem.hints.length > 0 && (
            <div className="problem-hints">
              {problem.hints.map((hint, index) => (
                <ProblemHintReveal key={hint.id} html={hint.bodyHtml} index={index + 1} />
              ))}
            </div>
          )}
          {proofs.length > 0 && !canViewSolutions && (
            <p className="quality-banner quality-unreviewed">
              {t.problemDetail.solutionsHiddenUntilVerified}
            </p>
          )}
          {proofs.length > 0 && canViewSolutions && (
            <details className="proof-reveal-gate">
              <summary>
                <span>{t.problemDetail.revealSolutions}</span>
                <small>{t.problemDetail.revealWarning}</small>
              </summary>
              <div className="proof-list">
                {proofs.map((proof) => {
                  const votes = proofVotes.get(proof.id) ?? 0;
                  const userVotedProof = ownProofVoteIds.has(proof.id);
                  const accepted = proof.id === acceptedProofId;
                  const canEditProof = Boolean(user && canEditSolution(user, proof));
                  const isOwnProof = user?.id === proof.authorId;
                  return (
                    <article key={proof.id} className={accepted ? "proof-card proof-accepted" : "proof-card"}>
                      <header className="proof-header">
                        <div>
                          {accepted && <span className="accepted-label">{t.problemDetail.communityAccepted}</span>}
                          <p className="meta">
                            {t.problemDetail.solutionBy} <Link href={`/profile/${proof.author.username}`}>{displayNameForUser(proof.author)}</Link>
                          </p>
                        </div>
                        <div className="proof-actions">
                          {canEditProof && (
                            <Link href={`/problems/${problem.slug}/proofs/${proof.id}/edit` as never} className="button secondary">
                              <Pencil size={16} />
                              {t.problemDetail.editSolution}
                            </Link>
                          )}
                          {user ? (
                            <form action={voteProofAction.bind(null, proof.id, problem.slug)}>
                              <button
                                type="submit"
                                className={userVotedProof ? "secondary vote-button-active" : "secondary"}
                                disabled={isOwnProof}
                                aria-pressed={userVotedProof}
                                title={
                                  isOwnProof
                                    ? t.problemDetail.cannotVoteOwnSolution
                                    : userVotedProof
                                      ? t.problemDetail.removeUsefulVote
                                      : t.problemDetail.markUseful
                                }
                              >
                                <ThumbsUp size={16} />
                                {votes}
                              </button>
                            </form>
                          ) : (
                            <span className="meta">{t.problemDetail.usefulVotes(votes)}</span>
                          )}
                        </div>
                      </header>
                      <MarkdownBlock html={proof.bodyHtml} />
                    </article>
                  );
                })}
              </div>
            </details>
          )}
          {user && (
            <details className="add-proof">
              <summary>{proofs.length === 0 ? t.problemDetail.firstSolution : t.problemDetail.addAnotherSolution}</summary>
              <form action={createProofAction.bind(null, problem.id, problem.slug)} className="grid gap-3 pt-3">
                <MarkdownEditor
                  name="bodyMarkdown"
                  minHeight="12rem"
                  lineNumbers={false}
                  draftKey={`problem:${problem.id}:new-solution`}
                  resetSignal={ownProofResetSignal}
                />
                <button type="submit">{t.problemDetail.publishSolution}</button>
              </form>
            </details>
          )}
        </section>

      </article>

        <aside className="problem-rail zen-hide">
          <div className="problem-difficulty-tile">
            <p>{t.problemDetail.difficulty}</p>
            <p className="problem-difficulty-value" style={{ color: difficultyTone }}>
              {problem.difficulty ?? "--"}
              <span>/100</span>
            </p>
            <span className="problem-difficulty-bars" aria-hidden="true">
              {[1, 2, 3, 4].map((level) => (
                <i key={level} style={{ background: level <= difficultyLevel ? difficultyTone : undefined }} />
              ))}
            </span>
          </div>

        <section className="action-surface">
          {user && attempt?.status !== "SOLVED" && (
            attempt ? (
              <button type="button" className="secondary attempted-state-button w-full" disabled>
                {t.problemDetail.attempted}
              </button>
            ) : (
              <form action={startAttemptAction.bind(null, problem.id, problem.slug)}>
                <button type="submit" className="secondary attempt-action-button w-full">
                  {t.problemDetail.startAttempting}
                </button>
              </form>
            )
          )}
          {attempt?.status === "SOLVED" ? (
            <form action={unmarkProblemSolvedAction.bind(null, problem.id, problem.slug)}>
              <button
                type="submit"
                className="secondary solved-state-button w-full"
                title={t.problemDetail.unmarkSolved}
                aria-pressed="true"
              >
                <Check size={17} />
                {t.problemDetail.solved}
              </button>
            </form>
          ) : problem.verificationMode === ProblemVerificationMode.NONE || user?.id === problem.authorId ? (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)}>
              <button type="submit" className="secondary w-full">
                <Check size={17} />
                {t.problemDetail.markSolved}
              </button>
            </form>
          ) : problem.verificationMode === ProblemVerificationMode.SELF_CHECK ? (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)} className="verification-box">
              <p className="font-medium">{t.problemDetail.verification}</p>
              <p className="muted text-sm">
                {problem.verificationPrompt || t.problemDetail.verificationPlaceholder}
              </p>
              <input name="verificationAnswer" required placeholder={t.problemDetail.shortAnswer} />
              <button type="submit" className="secondary w-full">
                <Check size={17} />
                {t.problemDetail.checkAndMarkSolved}
              </button>
            </form>
          ) : (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)} className="verification-box">
              <p className="font-medium">{t.problemDetail.authorReview}</p>
              <p className="muted text-sm">
                {problem.verificationPrompt || t.problemDetail.authorReviewDescription}
              </p>
              <textarea name="verificationAnswer" required placeholder={t.problemDetail.explainAnswer} />
              <button type="submit" className="secondary w-full">
                {t.problemDetail.requestVerification}
              </button>
            </form>
          )}
          {isOwnProblem ? (
            <div className="own-problem-favorite-note">
              <House size={17} aria-hidden="true" />
              {t.problemDetail.yourProblem} {"\u00b7"} {t.problemDetail.favoriteCount(favoriteCount)}
            </div>
          ) : (
            <form action={toggleProblemFavoriteAction.bind(null, problem.id, problem.slug)}>
              <button
                type="submit"
                className={favorite ? "favorite-state-button w-full" : "secondary favorite-action-button w-full"}
                title={favorite ? t.problemDetail.removeFavorite : t.problemDetail.addFavorite}
                aria-pressed={Boolean(favorite)}
              >
                <Heart size={17} fill={favorite ? "currentColor" : "none"} />
                {favorite ? t.problemDetail.favorited : t.problemDetail.addFavorite} {"\u00b7"} {t.problemDetail.favoriteCount(favoriteCount)}
              </button>
            </form>
          )}
          {ownVerificationRequests.length > 0 && attempt?.status !== "SOLVED" && (
            <div className="verification-history">
              {ownVerificationRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/problems/${problem.slug}/verification/${request.id}` as never}
                  className="verification-thread verification-thread-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{t.problemDetail.reviewStatus(verificationStatusLabel(request.status))}</span>
                  <span>{request.messages.length ? t.problemDetail.messages(request.messages.length) : t.problemDetail.openDiscussion}</span>
                </Link>
              ))}
            </div>
          )}
          <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
            {t.problemDetail.edit}
          </Link>
          <Link
            href={{ pathname: `/problems/${problem.slug}/discussion` }}
            className="button secondary"
            target="_blank"
            rel="noreferrer"
          >
            <MessageSquare size={17} />
            {t.problemDetail.discussions} {"\u00b7"} {t.problemDetail.messages(discussionPostCount)}
          </Link>
          {!discussionVisible && (
            <p className="muted text-xs">
              {t.problemDetail.discussionLocked}
            </p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">{t.problemDetail.report}</summary>
            <form action={reportProblemAction.bind(null, problem.id)} className="mt-3 grid gap-2">
              <textarea
                name="reason"
                placeholder={t.problemDetail.reportPlaceholder}
                required
              />
              <button type="submit" className="secondary">
                {t.problemDetail.submit}
              </button>
            </form>
          </details>
        </section>

        {pendingVerificationRequests.length > 0 && (
          <section className="sidebar-section verification-review-list">
            <h2 className="mb-3 font-semibold">{t.problemDetail.pendingVerifications}</h2>
            <div className="grid gap-3">
              {pendingVerificationRequests.map((request) => (
                <div key={request.id} className="verification-review-card">
                  <p className="meta">{displayNameForUser(request.user)}</p>
                  <div className="verification-submission">
                    <strong>{t.problemDetail.submittedAnswer}</strong>
                    <p>{request.answer}</p>
                  </div>
                  <Link
                    href={`/problems/${problem.slug}/verification/${request.id}` as never}
                    className="verification-thread verification-thread-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{t.problemDetail.openDiscussion}</span>
                    <span>{request.messages.length ? t.problemDetail.messages(request.messages.length) : t.problemDetail.noMessagesYet}</span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {links.length > 0 && (
          <section className="sidebar-section">
            <h2 className="mb-3 font-semibold">{t.problemDetail.linkedConcepts}</h2>
            <div className="grid gap-2 text-sm">
              {links.map((link) => (
                <Link
                  key={link.id}
                  href={(link.exists ? (linkedConceptHrefBySlug.get(link.targetSlug) ?? `/concepts/${link.targetSlug}`) : `/concepts/new?title=${link.targetSlug}`) as never}
                  className={link.exists ? "wiki-link" : "wiki-link missing"}
                >
                  {link.label ?? link.targetSlug}
                </Link>
              ))}
            </div>
          </section>
        )}

        {playlists.length > 0 && (
          <section className="sidebar-section">
            <h2 className="mb-3 font-semibold">{t.problemDetail.playlists}</h2>
            <div className="grid gap-2 text-sm">
              {playlists.map((item) => (
                <Link key={item.id} href={`/explorations/${item.playlist.slug}/start` as never} className="underline">
                  {item.playlist.title}
                </Link>
              ))}
            </div>
          </section>
        )}
      </aside>
      </div>
    </div>
  );
}
