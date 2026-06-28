import { ProblemVerificationMode } from "@prisma/client";
import Link from "next/link";
import { TargetType } from "@prisma/client";
import { QualityStatus } from "@prisma/client";
import { Check, Heart, MessageSquare, Pencil, ThumbsUp } from "lucide-react";
import { notFound } from "next/navigation";
import { ContentTranslations } from "@/components/ContentTranslations";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { HiddenHint } from "@/components/HiddenHint";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ZenModeToggle } from "@/components/ZenModeToggle";
import { reportPostAction, reportProblemAction } from "@/lib/actions/moderation-actions";
import {
  createDiscussionPostAction,
  deleteHintAction,
  createVerificationMessageAction,
  markProblemGoodAction,
  markProblemSolvedAction,
  reviewProblemVerificationAction,
  startAttemptAction,
  toggleProblemFavoriteAction,
  updateHintAction,
  updatePrivateNotesAction,
  votePostAction
} from "@/lib/actions/problem-actions";
import {
  createProofAction,
  createProofCommentAction,
  voteProofAction
} from "@/lib/actions/proof-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";
import {
  canEditDiscussionHint,
  canEditProblem,
  canEditSolution,
  canSetProblemQualityStatus,
  canViewArchivedProblem
} from "@/lib/permissions";
import { pluralize } from "@/lib/pluralize";
import { COMMUNITY_ACCEPTED_PROOF_VOTES } from "@/lib/problems";
import { problemLinkClass } from "@/lib/problem-link";
import { qualityLabel } from "@/lib/quality";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ProblemPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ verification?: string }>;
}) {
  const { slug } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const user = await getCurrentUser();
  const preferredLanguage = await getPreferredContentLanguage();
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      domains: { orderBy: { position: "asc" } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      thread: {
        include: {
          posts: {
            where: { deletedAt: null },
            include: { author: true },
            orderBy: { createdAt: "asc" }
          }
        }
      },
      proofs: {
        include: {
          author: true,
          comments: {
            include: { author: true },
            orderBy: { createdAt: "asc" }
          }
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
      }
    }
  });

  if (!problem) notFound();
  const isOwnProblem = user?.id === problem.authorId;
  const canViewArchived = canViewArchivedProblem(user, problem);
  if (problem.status === "ARCHIVED" && !canViewArchived) notFound();
  const hasSpecifiedOrigin =
    problem.origin.trim().toLowerCase() !== "unknown" ||
    Boolean(problem.originChapter || problem.originPage || problem.originNote);

  const postIds = problem.thread?.posts.map((post) => post.id) ?? [];
  const proofIds = problem.proofs.map((proof) => proof.id);
  const relatedProblemIds = problem.relatedGroups.flatMap((group) =>
    group.relations.map((relation) => relation.targetProblemId)
  );
  const postVoteGroupsPromise = postIds.length
    ? prisma.vote.groupBy({
        by: ["targetId"],
        where: { targetType: "POST", targetId: { in: postIds } },
        _count: { targetId: true }
      })
    : Promise.resolve([]);
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
    attempt,
    playlists,
    ownVerificationRequests,
    pendingVerificationRequests,
    postVoteGroups,
    proofVoteGroups,
    userVotes,
    favorite,
    favoriteCount,
    relatedSolvedAttempts
  ] = await Promise.all([
    prisma.problem.findMany({
      where: {
        translationGroupId: problem.translationGroupId,
        id: { not: problem.id },
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
      ? prisma.problemAttempt.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: problem.id } }
        })
      : null,
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
    user && canEditProblem(user, problem)
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
    postVoteGroupsPromise,
    proofVoteGroupsPromise,
    user && (postIds.length || proofIds.length)
      ? prisma.vote.findMany({
          where: {
            userId: user.id,
            OR: [
              ...(postIds.length ? [{ targetType: TargetType.POST, targetId: { in: postIds } }] : []),
              ...(proofIds.length ? [{ targetType: TargetType.PROOF, targetId: { in: proofIds } }] : [])
            ]
          },
          select: { targetType: true, targetId: true }
        })
      : Promise.resolve([]),
    user && !isOwnProblem
      ? prisma.problemFavorite.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: problem.id } }
        })
      : null,
    prisma.problemFavorite.count({ where: { problemId: problem.id, userId: { not: problem.authorId } } }),
    user && relatedProblemIds.length
      ? prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED", problemId: { in: relatedProblemIds } },
          select: { problemId: true }
        })
      : Promise.resolve([])
  ]);
  const postVotes = new Map(postVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const proofVotes = new Map(proofVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const ownPostVoteIds = new Set(userVotes.filter((vote) => vote.targetType === TargetType.POST).map((vote) => vote.targetId));
  const ownProofVoteIds = new Set(userVotes.filter((vote) => vote.targetType === TargetType.PROOF).map((vote) => vote.targetId));
  const relatedSolvedIds = new Set(relatedSolvedAttempts.map((attempt) => attempt.problemId));
  const proofs = [...problem.proofs].sort(
    (a, b) => (proofVotes.get(b.id) ?? 0) - (proofVotes.get(a.id) ?? 0) || a.createdAt.getTime() - b.createdAt.getTime()
  );
  const acceptedProofId =
    proofs.length > 0 && (proofVotes.get(proofs[0].id) ?? 0) >= COMMUNITY_ACCEPTED_PROOF_VOTES ? proofs[0].id : null;
  const isConjecture = problem.tags.some(({ tag }) => tag.slug === "conjecture");
  const visibleRelatedGroups = problem.relatedGroups
    .map((group) => ({
      ...group,
      relations: group.relations.filter((relation) => relation.targetProblem.status !== "ARCHIVED")
    }))
    .filter((group) => group.relations.length > 0);
  const canEditCurrentProblem = Boolean(user && canEditProblem(user, problem));
  const discussionVisible = Boolean(attempt || canEditCurrentProblem);
  const revealSpoilerDetails = attempt?.status === "SOLVED" || canEditCurrentProblem;
  const showSpoilerTags = problem.spoilerTags.length > 0 && revealSpoilerDetails;
  const problemDomains = problem.domains.length
    ? problem.domains.filter((item) => revealSpoilerDetails || !item.spoiler).map((item) => item.mscCode)
    : [problem.domain];
  const hiddenDomainCount = revealSpoilerDetails ? 0 : problem.domains.filter((item) => item.spoiler).length;
  const existingTranslationLanguages = new Set([problem.language, ...translations.map((translation) => translation.language)]);
  const targetTranslationLanguage =
    !existingTranslationLanguages.has(preferredLanguage)
      ? preferredLanguage
      : SUPPORTED_CONTENT_LANGUAGES.find((language) => !existingTranslationLanguages.has(language.code))?.code;
  const addTranslationHref = targetTranslationLanguage
    ? `/problems/new?translateOf=${problem.slug}&language=${targetTranslationLanguage}`
    : undefined;
  const verificationMessage =
    queryParams.verification === "incorrect" ? "This verification answer is not correct yet." : null;

  return (
    <div className="problem-page grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        {verificationMessage && (
          <p className="quality-banner quality-needs-work mb-4" role="status">
            {verificationMessage}
          </p>
        )}
        <div className="reading-header mb-5">
          <div className="mb-3 flex justify-end">
            <ZenModeToggle />
          </div>
          <h1>{problem.title}</h1>
          <p className="zen-meta muted mt-1">
            by{" "}
            <Link href={`/profile/${problem.author.username}`} className="underline">
              {displayNameForUser(problem.author)}
            </Link>
            {problem.difficulty ? ` \u00b7 difficulty ${problem.difficulty}/100` : ""}
          </p>
          <p className="zen-meta muted mt-1 text-sm">
            {problemDomains.length ? problemDomains.map(domainLabel).join(" / ") : "Domain hidden until solved"}
            {hiddenDomainCount > 0 && problemDomains.length > 0 ? " / spoiler domain hidden until solved" : ""}
          </p>
          <ContentTranslations
            currentLanguage={problem.language}
            hrefPrefix="/problems"
            translations={translations}
            createHref={addTranslationHref}
          />
          {!problem.listed && (
            <p className="zen-meta muted mt-1 text-sm">
              Playlist-specific: this problem is not listed in the public problem index.
            </p>
          )}
          {problem.tags.length > 0 && (
            <div className="zen-meta mt-3 flex flex-wrap gap-2">
              {problem.tags.map(({ tag }) => (
                <Link
                  key={tag.id}
                  href={`/problems?tag=${tag.slug}`}
                  className="tag"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          )}
          {showSpoilerTags && (
            <div className="zen-meta mt-3 flex flex-wrap gap-2">
              <span className="meta">Spoiler tags:</span>
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
        </div>

        {(problem.qualityStatus === "UNREVIEWED" || problem.qualityStatus === "NEEDS_WORK") && (
          <div
            className={
              problem.qualityStatus === "NEEDS_WORK"
                ? "zen-hide quality-banner quality-banner-compact quality-needs-work mb-4"
                : "zen-hide quality-banner quality-banner-compact quality-unreviewed mb-4"
            }
          >
            <strong>{qualityLabel(problem.qualityStatus)}.</strong>{" "}
            {problem.qualityStatus === "NEEDS_WORK"
              ? "This problem has been marked as needing work."
              : "This problem has not been reviewed by trusted users yet."}
            {user && canSetProblemQualityStatus(user.role, QualityStatus.GOOD) && (
              <form action={markProblemGoodAction.bind(null, problem.id, problem.slug)} className="mt-2">
                <button type="submit" className="secondary">
                  This problem is good enough for me
                </button>
              </form>
            )}
          </div>
        )}

        <section className="problem-statement reading-surface">
          <MarkdownBlock html={problem.bodyHtml} />
        </section>
        {hasSpecifiedOrigin && (
          <div className="problem-origin-note zen-meta">
            {problem.origin.trim().toLowerCase() !== "unknown" && <span>Origin: {problem.origin}</span>}
            {(problem.originChapter || problem.originPage || problem.originNote) && (
              <details>
                <summary>details</summary>
                <div className="grid gap-1 pt-2">
                  {problem.originChapter && <p>Chapter or section: {problem.originChapter}</p>}
                  {problem.originPage && <p>Page or problem number: {problem.originPage}</p>}
                  {problem.originNote && <p className="whitespace-pre-wrap">{problem.originNote}</p>}
                </div>
              </details>
            )}
          </div>
        )}

        <section className="zen-hide proof-section mt-8">
          <div className="section-heading">
            <h2>Solutions</h2>
            <span>{proofs.length}</span>
          </div>
          <p className="muted mb-4 text-sm">
            The most useful solution appears first. At {COMMUNITY_ACCEPTED_PROOF_VOTES} useful votes, it is marked community accepted.
          </p>
          {isConjecture && proofs.length === 0 && (
            <p className="quality-banner quality-stub">This problem is marked as a conjecture. No solution is known here yet.</p>
          )}
          {proofs.length > 0 && (
            <details className="proof-reveal-gate">
              <summary>
                <span>Reveal solutions</span>
                <small>Are you sure? This will show solutions.</small>
              </summary>
              <div className="grid gap-4 pt-4">
                {proofs.map((proof) => {
                  const votes = proofVotes.get(proof.id) ?? 0;
                  const userVotedProof = ownProofVoteIds.has(proof.id);
                  const accepted = proof.id === acceptedProofId;
                  const canEditProof = Boolean(user && canEditSolution(user, proof));
                  return (
                    <article key={proof.id} className={accepted ? "proof-card proof-accepted" : "proof-card"}>
                      <header className="proof-header">
                        <div>
                          {accepted && <span className="accepted-label">Community accepted</span>}
                          <p className="meta">
                            Solution by <Link href={`/profile/${proof.author.username}`}>{displayNameForUser(proof.author)}</Link>
                          </p>
                        </div>
                        <div className="proof-actions">
                          {canEditProof && (
                            <Link href={`/problems/${problem.slug}/proofs/${proof.id}/edit` as never} className="button secondary">
                              <Pencil size={16} />
                              Edit solution
                            </Link>
                          )}
                          {user ? (
                            <form action={voteProofAction.bind(null, proof.id, problem.slug)}>
                              <button
                                type="submit"
                                className={userVotedProof ? "secondary vote-button-active" : "secondary"}
                                aria-pressed={userVotedProof}
                                title={userVotedProof ? "Remove useful vote" : "Mark as useful"}
                              >
                                <ThumbsUp size={16} />
                                {votes}
                              </button>
                            </form>
                          ) : (
                            <span className="meta">{votes} useful votes</span>
                          )}
                        </div>
                      </header>
                      <MarkdownBlock html={proof.bodyHtml} />
                      <details className="proof-discussion">
                        <summary>
                          <MessageSquare size={15} />
                          Discuss solution {"\u00b7"} {proof.comments.length}
                        </summary>
                        <div className="grid gap-3 pt-3">
                          {proof.comments.map((comment) => (
                            <div key={comment.id} className="proof-comment">
                              <p className="meta">{displayNameForUser(comment.author)}</p>
                              <MarkdownBlock html={comment.bodyHtml} />
                            </div>
                          ))}
                          {user && (
                            <form action={createProofCommentAction.bind(null, proof.id, problem.slug)} className="grid gap-2">
                              <LazyMarkdownEditor name="bodyMarkdown" minHeight="7rem" lineNumbers={false} />
                              <button type="submit" className="secondary">Add comment</button>
                            </form>
                          )}
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            </details>
          )}
          {user && (
            <details className="add-proof">
              <summary>{proofs.length === 0 ? "Be the first to add your solution!" : "Add another solution"}</summary>
              <form action={createProofAction.bind(null, problem.id, problem.slug)} className="grid gap-3 pt-3">
                <MarkdownEditor name="bodyMarkdown" minHeight="12rem" lineNumbers={false} />
                <button type="submit">Publish solution</button>
              </form>
            </details>
          )}
        </section>

        <section className="zen-hide related-problems-section mt-8">
          <details>
            <summary>
              <span>Show related problems</span>
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
                          <strong>{targetProblem.title}</strong>
                          <span>
                            by {displayNameForUser(targetProblem.author)}
                            {targetProblem.difficulty ? ` \u00b7 difficulty ${targetProblem.difficulty}/100` : ""}
                            {!targetProblem.listed ? " \u00b7 unlisted" : ""}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No related problems yet.</p>
              )}
              {canEditCurrentProblem && (
                <div className="related-problem-actions">
                  <Link href={`/problems/new?parent=${problem.slug}&listed=0&language=${problem.language}`} className="button">
                    Create problem specific to this one
                  </Link>
                  <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
                    Edit related problems
                  </Link>
                </div>
              )}
            </div>
          </details>
        </section>

        <section className="zen-hide discussion-surface mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-semibold">Discussion</h2>
          </div>

          {!user && (
            <p className="muted">
              <Link href="/login" className="underline">
                Sign in
              </Link>{" "}
              to start this problem and reveal the discussion.
            </p>
          )}

          {user && !attempt && !canEditCurrentProblem && <p className="muted">The discussion stays hidden until you start the problem.</p>}

          {discussionVisible && (
            <div className="grid gap-4">
              {(problem.thread?.posts ?? []).map((post) => {
                const canManageHint = Boolean(user && post.type === "HINT" && canEditDiscussionHint(user, post));

                return (
                  <div key={post.id} className="border-t border-line pt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="muted text-sm">
                        <span className="rounded border border-line px-2 py-0.5 text-xs">
                          {post.type.toLowerCase()}
                        </span>{" "}
                        by{" "}
                        <Link href={`/profile/${post.author.username}`} className="underline">
                          {displayNameForUser(post.author)}
                        </Link>
                      </div>
                      <form action={votePostAction.bind(null, post.id, problem.slug)}>
                        <button
                          type="submit"
                          className={ownPostVoteIds.has(post.id) ? "secondary vote-button-active" : "secondary"}
                          aria-pressed={ownPostVoteIds.has(post.id)}
                          title={ownPostVoteIds.has(post.id) ? "Remove useful vote" : "Mark as useful"}
                        >
                          Useful {"\u00b7"} {postVotes.get(post.id) ?? 0}
                        </button>
                      </form>
                    </div>
                    {post.type === "HINT" ? <HiddenHint postId={post.id} /> : <MarkdownBlock html={post.bodyHtml} />}
                    {canManageHint && (
                      <div className="mt-3 grid gap-3 text-sm">
                        <details>
                          <summary className="cursor-pointer font-medium">Edit hint</summary>
                          <form action={updateHintAction.bind(null, post.id, problem.slug)} className="mt-3 grid gap-2">
                            <LazyMarkdownEditor
                              name="bodyMarkdown"
                              initialValue={post.bodyMarkdown}
                              minHeight="7rem"
                              lineNumbers={false}
                            />
                            <button type="submit" className="secondary">
                              Save hint
                            </button>
                          </form>
                        </details>
                        <form action={deleteHintAction.bind(null, post.id, problem.slug)}>
                          <button type="submit" className="secondary">
                            Delete hint
                          </button>
                        </form>
                      </div>
                    )}
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-medium">Report post</summary>
                      <form action={reportPostAction.bind(null, post.id, problem.slug)} className="mt-3 grid gap-2">
                        <textarea name="reason" placeholder="Off-topic, spoiler, incorrect solution..." required />
                        <button type="submit" className="secondary">
                          Submit report
                        </button>
                      </form>
                    </details>
                  </div>
                );
              })}
              {(problem.thread?.posts.length ?? 0) === 0 && <p className="muted">No messages yet.</p>}
              <form action={createDiscussionPostAction.bind(null, problem.id)} className="grid gap-3">
                <select name="type" defaultValue="COMMENT">
                  <option value="COMMENT">Comment</option>
                  <option value="HINT">Hint</option>
                  <option value="SOLUTION">Solution</option>
                  <option value="GENERALIZATION">Generalization</option>
                  <option value="CORRECTION">Correction</option>
                </select>
                <LazyMarkdownEditor name="bodyMarkdown" minHeight="9rem" lineNumbers={false} />
                <button type="submit">Post</button>
              </form>
            </div>
          )}
        </section>
      </article>

      <aside className="zen-hide grid content-start gap-5">
        <section className="action-surface">
          {user && attempt?.status !== "SOLVED" && (
            attempt ? (
              <button type="button" className="secondary attempted-state-button w-full" disabled>
                Attempted
              </button>
            ) : (
              <form action={startAttemptAction.bind(null, problem.id, problem.slug)}>
                <button type="submit" className="secondary attempt-action-button w-full">
                  I am attempting to solve this problem
                </button>
              </form>
            )
          )}
          {attempt?.status === "SOLVED" ? (
            <button type="button" className="secondary solved-state-button w-full" disabled>
              <Check size={17} />
              Solved
            </button>
          ) : problem.verificationMode === ProblemVerificationMode.NONE || user?.id === problem.authorId ? (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)}>
              <button type="submit" className="secondary w-full">
                <Check size={17} />
                I solved it
              </button>
            </form>
          ) : problem.verificationMode === ProblemVerificationMode.SELF_CHECK ? (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)} className="verification-box">
              <p className="font-medium">Verification</p>
              <p className="muted text-sm">
                {problem.verificationPrompt || "Enter the short verification answer."}
              </p>
              <input name="verificationAnswer" required placeholder="Short answer" />
              <button type="submit" className="secondary w-full">
                <Check size={17} />
                Check and mark solved
              </button>
            </form>
          ) : (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)} className="verification-box">
              <p className="font-medium">Author review</p>
              <p className="muted text-sm">
                {problem.verificationPrompt || "Send a short explanation to the problem author for validation."}
              </p>
              <textarea name="verificationAnswer" required placeholder="Explain your answer briefly..." />
              <button type="submit" className="secondary w-full">
                Request verification
              </button>
            </form>
          )}
          {isOwnProblem ? (
            <div className="own-problem-favorite-note">
              <span className="problem-own-dot" aria-hidden="true" />
              Your problem {"\u00b7"} {pluralize(favoriteCount, "favorite")}
            </div>
          ) : (
            <form action={toggleProblemFavoriteAction.bind(null, problem.id, problem.slug)}>
              <button
                type="submit"
                className={favorite ? "favorite-state-button w-full" : "secondary favorite-action-button w-full"}
                title={favorite ? "Remove from favorites" : "Add this problem to favorites"}
                aria-pressed={Boolean(favorite)}
              >
                <Heart size={17} fill={favorite ? "currentColor" : "none"} />
                {favorite ? "Favorited" : "Add this problem to favorites"} {"\u00b7"} {pluralize(favoriteCount, "favorite")}
              </button>
            </form>
          )}
          {ownVerificationRequests.length > 0 && attempt?.status !== "SOLVED" && (
            <div className="verification-history">
              {ownVerificationRequests.map((request) => (
                <details key={request.id} className="verification-thread">
                  <summary>
                    <span>Review: <strong>{request.status.toLowerCase()}</strong></span>
                    <span>{request.messages.length ? `${request.messages.length} messages` : "Open discussion"}</span>
                  </summary>
                  <div className="verification-thread-body">
                    <div className="verification-submission">
                      <strong>Your submitted answer</strong>
                      <p>{request.answer}</p>
                    </div>
                    {request.messages.length > 0 && (
                      <div className="verification-messages">
                        {request.messages.map((message) => (
                          <div key={message.id} className="verification-message">
                            <p className="meta">by {displayNameForUser(message.author)}</p>
                            <MarkdownBlock html={message.bodyHtml} />
                          </div>
                        ))}
                      </div>
                    )}
                    {request.status === "PENDING" && (
                      <form action={createVerificationMessageAction.bind(null, request.id, problem.slug)} className="grid gap-2">
                        <LazyMarkdownEditor name="bodyMarkdown" minHeight="7rem" lineNumbers={false} />
                        <button type="submit" className="secondary">Reply privately</button>
                      </form>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
          <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
            Edit
          </Link>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Report</summary>
            <form action={reportProblemAction.bind(null, problem.id)} className="mt-3 grid gap-2">
              <textarea
                name="reason"
                placeholder="Incorrect statement, unclear wording, questionable source, copied wording..."
                required
              />
              <button type="submit" className="secondary">
                Submit
              </button>
            </form>
          </details>
        </section>

        {pendingVerificationRequests.length > 0 && (
          <section className="sidebar-section verification-review-list">
            <h2 className="mb-3 font-semibold">Pending verifications</h2>
            <div className="grid gap-3">
              {pendingVerificationRequests.map((request) => (
                <div key={request.id} className="verification-review-card">
                  <p className="meta">{displayNameForUser(request.user)}</p>
                  <div className="verification-submission">
                    <strong>Submitted answer</strong>
                    <p>{request.answer}</p>
                  </div>
                  <details className="verification-thread">
                    <summary>
                      <span>Open discussion</span>
                      <span>{request.messages.length ? `${request.messages.length} messages` : "No messages yet"}</span>
                    </summary>
                    <div className="verification-thread-body">
                      {request.messages.length > 0 && (
                        <div className="verification-messages">
                          {request.messages.map((message) => (
                            <div key={message.id} className="verification-message">
                              <p className="meta">by {displayNameForUser(message.author)}</p>
                              <MarkdownBlock html={message.bodyHtml} />
                            </div>
                          ))}
                        </div>
                      )}
                      <form action={createVerificationMessageAction.bind(null, request.id, problem.slug)} className="grid gap-2">
                        <LazyMarkdownEditor name="bodyMarkdown" minHeight="7rem" lineNumbers={false} />
                        <button type="submit" className="secondary">Reply privately</button>
                      </form>
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <form action={reviewProblemVerificationAction.bind(null, request.id, "APPROVED")}>
                      <button type="submit" className="secondary">Approve answer</button>
                    </form>
                    <form action={reviewProblemVerificationAction.bind(null, request.id, "REJECTED")}>
                      <button type="submit" className="secondary">Close as not accepted</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {attempt && (
          <section className="sidebar-section">
            <h2 className="mb-3 font-semibold">Private notes</h2>
            <form action={updatePrivateNotesAction.bind(null, problem.id)} className="grid gap-3">
              <select name="status" defaultValue={attempt.status}>
                <option value="STARTED">Started</option>
                <option value="BLOCKED">Blocked</option>
                {problem.verificationMode === ProblemVerificationMode.NONE && <option value="SOLVED">Solved</option>}
                <option value="REVIEW_LATER">Review later</option>
              </select>
              <LazyMarkdownEditor
                name="privateNotesMarkdown"
                initialValue={attempt.privateNotesMarkdown ?? ""}
                minHeight="9rem"
                lineNumbers={false}
              />
              <button type="submit" className="secondary">
                Save
              </button>
            </form>
          </section>
        )}

        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">Linked concepts</h2>
          <div className="grid gap-2 text-sm">
            {links.map((link) => (
              <Link
                key={link.id}
                href={link.exists ? `/concepts/${link.targetSlug}` : `/concepts/new?title=${link.targetSlug}`}
                className={link.exists ? "wiki-link" : "wiki-link missing"}
              >
                {link.label ?? link.targetSlug}
              </Link>
            ))}
            {links.length === 0 && <p className="muted">No wikilinks.</p>}
          </div>
        </section>

        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">Playlists</h2>
          <div className="grid gap-2 text-sm">
            {playlists.map((item) => (
              <Link key={item.id} href={`/playlists/${item.playlist.slug}`} className="underline">
                {item.playlist.title}
              </Link>
            ))}
            {playlists.length === 0 && <p className="muted">Not in a playlist yet.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}
