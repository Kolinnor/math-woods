import { NotificationType, TargetType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { HiddenHint } from "@/components/HiddenHint";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import { reportPostAction } from "@/lib/actions/moderation-actions";
import {
  createDiscussionPostAction,
  deleteHintAction,
  updateHintAction,
  votePostAction
} from "@/lib/actions/problem-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { canEditDiscussionHint, canViewArchivedProblem } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";

export const dynamic = "force-dynamic";

export default async function ProblemDiscussionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations();
  const user = await getCurrentUser();
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      thread: {
        include: {
          posts: {
            where: { deletedAt: null },
            include: { author: true },
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!problem) notFound();
  if (problem.status === "ARCHIVED" && !canViewArchivedProblem(user, problem)) notFound();
  if (!canViewProblem(user, problem)) notFound();
  if (user) {
    await markNotificationsReadForHref(user.id, `/problems/${problem.slug}/discussion`, NotificationType.DISCUSSION_POSTED);
  }

  const [postVoteGroups, userVotes] = await Promise.all([
    problem.thread?.posts.length
      ? prisma.vote.groupBy({
          by: ["targetId"],
          where: { targetType: TargetType.POST, targetId: { in: problem.thread.posts.map((post) => post.id) } },
          _count: { targetId: true }
        })
      : Promise.resolve([]),
    user && problem.thread?.posts.length
      ? prisma.vote.findMany({
          where: {
            userId: user.id,
            targetType: TargetType.POST,
            targetId: { in: problem.thread.posts.map((post) => post.id) }
          },
          select: { targetId: true }
        })
      : Promise.resolve([])
  ]);

  const postVotes = new Map(postVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const ownPostVoteIds = new Set(userVotes.map((vote) => vote.targetId));
  const ownDiscussionPostResetSignal =
    user && problem.thread ? problem.thread.posts.filter((post) => post.authorId === user.id).at(-1)?.id ?? 0 : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="muted text-sm">{t.problemDetail.discussions}</p>
          <h1 className="text-2xl font-bold">
            <AsyncMarkdownInline markdown={problem.title} />
          </h1>
        </div>
        <Link href={`/problems/${problem.slug}`} className="button secondary">
          {t.problemDetail.problem}
        </Link>
      </div>

      {!user && (
        <p className="muted panel p-5">
          <Link href="/login" className="underline">
            {t.nav.signIn}
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      <div className="grid gap-4">
        {(problem.thread?.posts ?? []).map((post) => {
          const canManageHint = Boolean(user && post.type === "HINT" && canEditDiscussionHint(user, post));

          return (
            <article key={post.id} className="panel p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="muted text-sm">
                      <span className="rounded border border-line px-2 py-0.5 text-xs">
                        {post.type.toLowerCase()}
                      </span>{" "}
                      by{" "}
                      <Link href={`/profile/${post.author.username}`} className="underline">
                        <UserName user={post.author} />
                      </Link>{" "}
                      {"\u00b7"} {post.createdAt.toLocaleString("en-US")}
                </div>
                {user && (
                  <form action={votePostAction.bind(null, post.id, problem.slug, true)}>
                      <button
                        type="submit"
                        className={ownPostVoteIds.has(post.id) ? "secondary vote-button-active" : "secondary"}
                        aria-pressed={ownPostVoteIds.has(post.id)}
                        title={ownPostVoteIds.has(post.id) ? "Remove useful vote" : "Mark as useful"}
                      >
                        Useful {"\u00b7"} {postVotes.get(post.id) ?? 0}
                      </button>
                  </form>
                )}
              </div>
              {post.type === "HINT" ? <HiddenHint postId={post.id} /> : <MarkdownBlock html={post.bodyHtml} />}
              {canManageHint && (
                    <div className="mt-3 grid gap-3 text-sm">
                      <details>
                        <summary className="cursor-pointer font-medium">Edit hint</summary>
                        <form action={updateHintAction.bind(null, post.id, problem.slug, true)} className="mt-3 grid gap-2">
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
                      <form action={deleteHintAction.bind(null, post.id, problem.slug, true)}>
                        <button type="submit" className="secondary">
                          Delete hint
                        </button>
                      </form>
                    </div>
              )}
              {user && (
                <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium">Report post</summary>
                    <form action={reportPostAction.bind(null, post.id, problem.slug)} className="mt-3 grid gap-2">
                      <textarea name="reason" placeholder="Off-topic, spoiler, incorrect solution..." required />
                      <button type="submit" className="secondary">
                        Submit report
                      </button>
                    </form>
                </details>
              )}
            </article>
          );
        })}
        {(problem.thread?.posts.length ?? 0) === 0 && (
          <p className="muted panel p-5">{t.problemDetail.noMessagesYet}</p>
        )}
      </div>

      {user && (
        <form action={createDiscussionPostAction.bind(null, problem.id, true)} className="panel mt-6 grid gap-3 p-5">
          <h2 className="text-sm font-medium">Add to the discussion</h2>
          <LazyMarkdownEditor
            name="bodyMarkdown"
            minHeight="9rem"
            lineNumbers={false}
            draftKey={`problem-discussion:${problem.id}:reply`}
            resetSignal={ownDiscussionPostResetSignal}
          />
          <button type="submit">Post</button>
        </form>
      )}
    </div>
  );
}
