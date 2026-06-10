import Link from "next/link";
import { Check, Heart, MessageSquare, ThumbsUp } from "lucide-react";
import { notFound } from "next/navigation";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { HiddenHint } from "@/components/HiddenHint";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { ZenModeToggle } from "@/components/ZenModeToggle";
import { reportPostAction, reportProblemAction } from "@/lib/actions/moderation-actions";
import {
  createDiscussionPostAction,
  markProblemSolvedAction,
  startAttemptAction,
  toggleProblemFavoriteAction,
  updatePrivateNotesAction,
  votePostAction,
  voteProblemAction
} from "@/lib/actions/problem-actions";
import {
  createProofAction,
  createProofCommentAction,
  scoreProblemAction,
  voteProofAction
} from "@/lib/actions/proof-actions";
import { discussionIsUnlocked, formatUnlockDistance } from "@/lib/attempts";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import {
  COMMUNITY_ACCEPTED_PROOF_VOTES,
  PROBLEM_SCORE_REPUTATION,
  PROBLEM_SCORE_SOLVED_COUNT
} from "@/lib/problems";
import { qualityDescription, qualityLabel } from "@/lib/quality";

export const dynamic = "force-dynamic";

async function relatedQuotesForProblem(problemId: number) {
  try {
    return await prisma.quoteProblem.findMany({
      where: { problemId },
      include: { quote: true },
      orderBy: { quote: { createdAt: "desc" } },
      take: 5
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") {
      return [];
    }
    throw error;
  }
}

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
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
      }
    }
  });

  if (!problem) notFound();

  const postIds = problem.thread?.posts.map((post) => post.id) ?? [];
  const proofIds = problem.proofs.map((proof) => proof.id);
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
    links,
    attempt,
    voteCount,
    playlists,
    relatedQuotes,
    postVoteGroups,
    proofVoteGroups,
    favorite,
    favoriteCount,
    scoreAggregate,
    userScore,
    userSolvedCount
  ] = await Promise.all([
    prisma.internalLink.findMany({
      where: { sourceType: "PROBLEM", sourceId: problem.id },
      orderBy: { targetSlug: "asc" }
    }),
    user
      ? prisma.problemAttempt.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: problem.id } }
        })
      : null,
    prisma.vote.count({ where: { targetType: "PROBLEM", targetId: problem.id } }),
    prisma.playlistItem.findMany({
      where: { problemId: problem.id },
      include: { playlist: true },
      take: 6
    }),
    relatedQuotesForProblem(problem.id),
    postVoteGroupsPromise,
    proofVoteGroupsPromise,
    user
      ? prisma.problemFavorite.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: problem.id } }
        })
      : null,
    prisma.problemFavorite.count({ where: { problemId: problem.id } }),
    prisma.problemScore.aggregate({
      where: { problemId: problem.id },
      _avg: { naturality: true },
      _count: { naturality: true }
    }),
    user
      ? prisma.problemScore.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: problem.id } }
        })
      : null,
    user ? prisma.problemAttempt.count({ where: { userId: user.id, status: "SOLVED" } }) : 0
  ]);
  const postVotes = new Map(postVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const proofVotes = new Map(proofVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const proofs = [...problem.proofs].sort(
    (a, b) => (proofVotes.get(b.id) ?? 0) - (proofVotes.get(a.id) ?? 0) || a.createdAt.getTime() - b.createdAt.getTime()
  );
  const acceptedProofId =
    proofs.length > 0 && (proofVotes.get(proofs[0].id) ?? 0) >= COMMUNITY_ACCEPTED_PROOF_VOTES ? proofs[0].id : null;
  const unlocked = attempt ? discussionIsUnlocked(attempt.discussionUnlockAt) : false;
  const isConjecture = problem.tags.some(({ tag }) => tag.slug === "conjecture");
  const mayScore =
    attempt?.status === "SOLVED" &&
    Boolean(
      user &&
        (user.reputation >= PROBLEM_SCORE_REPUTATION ||
          userSolvedCount >= PROBLEM_SCORE_SOLVED_COUNT ||
          user.role === "MODERATOR" ||
          user.role === "ADMIN")
    );

  return (
    <div className="problem-page grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="reading-header mb-5">
          <div className="mb-3 flex justify-end">
            <ZenModeToggle />
          </div>
          <h1>{problem.title}</h1>
          <p className="zen-meta muted mt-1">
            by{" "}
            <Link href={`/profile/${problem.author.username}`} className="underline">
              @{problem.author.username}
            </Link>
            {problem.difficulty ? ` · difficulty ${problem.difficulty}/100` : ""}
          </p>
          <p className="zen-meta muted mt-1 text-sm">{domainLabel(problem.domain)}</p>
          <p className="zen-meta muted mt-1 text-sm">Status: {qualityLabel(problem.qualityStatus)}</p>
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
        </div>

        {(problem.qualityStatus === "UNREVIEWED" || problem.qualityStatus === "NEEDS_WORK") && (
          <div
            className={
              problem.qualityStatus === "NEEDS_WORK"
                ? "zen-hide quality-banner quality-needs-work mb-4"
                : "zen-hide quality-banner quality-unreviewed mb-4"
            }
          >
            <strong>{qualityLabel(problem.qualityStatus)}.</strong> {qualityDescription(problem.qualityStatus)}
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
                Improve this problem
              </Link>
              <Link href={`/problems/${problem.slug}/history`} className="button secondary">
                See revisions
              </Link>
            </div>
          </div>
        )}

        <section className="problem-statement reading-surface">
          <MarkdownBlock html={problem.bodyHtml} />
        </section>

        <section className="zen-hide proof-section mt-8">
          <div className="section-heading">
            <h2>Proofs</h2>
            <span>{proofs.length}</span>
          </div>
          <p className="muted mb-4 text-sm">
            The most useful proof appears first. At {COMMUNITY_ACCEPTED_PROOF_VOTES} useful votes, it is marked community accepted.
          </p>
          {isConjecture && proofs.length === 0 && (
            <p className="quality-banner quality-stub">This problem is marked as a conjecture. No proof is known here yet.</p>
          )}
          <div className="grid gap-4">
            {proofs.map((proof) => {
              const votes = proofVotes.get(proof.id) ?? 0;
              const accepted = proof.id === acceptedProofId;
              return (
                <article key={proof.id} className={accepted ? "proof-card proof-accepted" : "proof-card"}>
                  <header className="proof-header">
                    <div>
                      {accepted && <span className="accepted-label">Community accepted</span>}
                      <p className="meta">
                        Proof by <Link href={`/profile/${proof.author.username}`}>@{proof.author.username}</Link>
                      </p>
                    </div>
                    {user ? (
                      <form action={voteProofAction.bind(null, proof.id, problem.slug)}>
                        <button type="submit" className="secondary">
                          <ThumbsUp size={16} />
                          {votes}
                        </button>
                      </form>
                    ) : (
                      <span className="meta">{votes} useful votes</span>
                    )}
                  </header>
                  <MarkdownBlock html={proof.bodyHtml} />
                  <details className="proof-discussion">
                    <summary>
                      <MessageSquare size={15} />
                      Discuss proof · {proof.comments.length}
                    </summary>
                    <div className="grid gap-3 pt-3">
                      {proof.comments.map((comment) => (
                        <div key={comment.id} className="proof-comment">
                          <p className="meta">@{comment.author.username}</p>
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
          {user && (
            <details className="add-proof">
              <summary>Add another proof</summary>
              <form action={createProofAction.bind(null, problem.id, problem.slug)} className="grid gap-3 pt-3">
                <LazyMarkdownEditor name="bodyMarkdown" minHeight="12rem" lineNumbers={false} />
                <button type="submit">Publish proof</button>
              </form>
            </details>
          )}
        </section>

        <section className="zen-hide discussion-surface mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-semibold">Discussion</h2>
            {!attempt && user && (
              <form action={startAttemptAction.bind(null, problem.id)}>
                <button type="submit">Start this problem</button>
              </form>
            )}
          </div>

          {!user && (
            <p className="muted">
              <Link href="/login" className="underline">
                Sign in
              </Link>{" "}
              to start this problem and unlock the discussion after 24h.
            </p>
          )}

          {user && !attempt && <p className="muted">The discussion stays hidden until you start the problem.</p>}

          {attempt && !unlocked && (
            <p className="muted">
              Discussion locked for another {formatUnlockDistance(attempt.discussionUnlockAt)}. You can keep private
              notes in the meantime.
            </p>
          )}

          {attempt && unlocked && problem.thread && (
            <div className="grid gap-4">
              {problem.thread.posts.map((post) => (
                <div key={post.id} className="border-t border-line pt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="muted text-sm">
                      <span className="rounded border border-line px-2 py-0.5 text-xs">
                        {post.type.toLowerCase()}
                      </span>{" "}
                      by{" "}
                      <Link href={`/profile/${post.author.username}`} className="underline">
                        @{post.author.username}
                      </Link>
                    </div>
                    <form action={votePostAction.bind(null, post.id, problem.slug)}>
                      <button type="submit" className="secondary">
                        Useful · {postVotes.get(post.id) ?? 0}
                      </button>
                    </form>
                  </div>
                  {post.type === "HINT" ? <HiddenHint postId={post.id} /> : <MarkdownBlock html={post.bodyHtml} />}
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
              ))}
              {problem.thread.posts.length === 0 && <p className="muted">No messages yet.</p>}
              <form action={createDiscussionPostAction.bind(null, problem.thread.id, problem.id)} className="grid gap-3">
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
          <form action={toggleProblemFavoriteAction.bind(null, problem.id, problem.slug)}>
            <button type="submit" className="secondary w-full">
              <Heart size={17} fill={favorite ? "currentColor" : "none"} />
              {favorite ? "Favorited" : "Favorite"} · {favoriteCount}
            </button>
          </form>
          {attempt?.status === "SOLVED" ? (
            <button type="button" className="secondary w-full" disabled>
              <Check size={17} />
              Solved
            </button>
          ) : (
            <form action={markProblemSolvedAction.bind(null, problem.id, problem.slug)}>
              <button type="submit" className="secondary w-full">
                <Check size={17} />
                I solved this problem
              </button>
            </form>
          )}
          <form action={voteProblemAction.bind(null, problem.id)}>
            <button type="submit" className="w-full">
              Vote · {voteCount}
            </button>
          </form>
          <Link href={`/problems/${problem.slug}/export`} className="button secondary">
            Export Markdown
          </Link>
          <Link href={`/problems/${problem.slug}/edit`} className="button secondary">
            Edit
          </Link>
          <Link href={`/problems/${problem.slug}/history`} className="button secondary">
            History
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
          <details className="problem-origin text-sm">
            <summary>
              <span className="muted">Origin</span>
              <span>{problem.origin}</span>
            </summary>
            <div className="grid gap-2 pt-3">
              {problem.originChapter && (
                <p>
                  <span className="muted">Chapter or section:</span> {problem.originChapter}
                </p>
              )}
              {problem.originPage && (
                <p>
                  <span className="muted">Page or problem number:</span> {problem.originPage}
                </p>
              )}
              {problem.originNote && <p className="whitespace-pre-wrap">{problem.originNote}</p>}
              {!problem.originChapter && !problem.originPage && !problem.originNote && (
                <p className="muted">No further provenance details are known yet.</p>
              )}
            </div>
          </details>
          {problem.license && <p className="muted text-sm">License: {problem.license}</p>}
        </section>

        {attempt && (
          <section className="sidebar-section">
            <h2 className="mb-3 font-semibold">Private notes</h2>
            <form action={updatePrivateNotesAction.bind(null, problem.id)} className="grid gap-3">
              <select name="status" defaultValue={attempt.status}>
                <option value="STARTED">Started</option>
                <option value="BLOCKED">Blocked</option>
                <option value="SOLVED">Solved</option>
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
          <h2 className="mb-2 font-semibold">Naturality ↔ arbitrariness</h2>
          {scoreAggregate._count.naturality > 0 ? (
            <p className="score-reading">
              <strong>{Math.round(scoreAggregate._avg.naturality ?? 0)}</strong>
              <span> / 100 · {scoreAggregate._count.naturality} ratings</span>
            </p>
          ) : (
            <p className="muted text-sm">No ratings yet.</p>
          )}
          {mayScore ? (
            <form action={scoreProblemAction.bind(null, problem.id, problem.slug)} className="score-form">
              <div className="score-scale-labels">
                <span>Natural</span>
                <span>Arbitrary</span>
              </div>
              <input name="naturality" type="range" min="1" max="100" defaultValue={userScore?.naturality ?? 50} />
              <button type="submit" className="secondary">Save rating</button>
            </form>
          ) : (
            <p className="muted mt-2 text-xs">
              Ratings open after solving this problem and five problems overall, or reaching reputation 10.
            </p>
          )}
        </section>

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
          <h2 className="mb-3 font-semibold">Related quotes</h2>
          <div className="grid gap-2 text-sm">
            {relatedQuotes.map(({ quote }) => (
              <Link key={quote.id} href={`/quotes/${quote.slug}`} className="quote-mini-link">
                <span>“{quote.text}”</span>
                <small>{quote.attributedTo ?? quote.provenance}</small>
              </Link>
            ))}
            {relatedQuotes.length === 0 && <p className="muted">No related quotes yet.</p>}
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
