import { TargetType } from "@prisma/client";
import { ArrowLeft, Flag, Lightbulb, MessageCircle, MessageSquarePlus, Pencil, Send, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { HiddenHint } from "@/components/HiddenHint";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { SignInLink } from "@/components/SignInLink";
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
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canEditDiscussionHint, canViewArchivedProblem } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

const discussionCopy = {
  en: {
    add: "Add to the discussion",
    back: "Back to problem",
    by: "by",
    deleteHint: "Delete hint",
    editHint: "Edit hint",
    hint: "Hint",
    join: "to join the discussion.",
    markUseful: "Mark as useful",
    messages: (count: number) => `${count} ${count === 1 ? "message" : "messages"}`,
    noMessages: "No messages yet.",
    post: "Post",
    removeUseful: "Remove useful vote",
    report: "Report",
    reportPlaceholder: "Off-topic, spoiler, or incorrect information...",
    saveHint: "Save hint",
    submitReport: "Submit report"
  },
  fr: {
    add: "Ajouter à la discussion",
    back: "Retour au problème",
    by: "par",
    deleteHint: "Supprimer l'indication",
    editHint: "Modifier l'indication",
    hint: "Indication",
    join: "pour participer a la discussion.",
    markUseful: "Marquer comme utile",
    messages: (count: number) => `${count} message${count === 1 ? "" : "s"}`,
    noMessages: "Aucun message pour l'instant.",
    post: "Publier",
    removeUseful: "Retirer le vote utile",
    report: "Signaler",
    reportPlaceholder: "Hors sujet, divulgation, information incorrecte...",
    saveHint: "Enregistrer l'indication",
    submitReport: "Envoyer le signalement"
  }
} as const;

export default async function ProblemDiscussionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, interfaceLocale, user, timeZone] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getCurrentUser(),
    getRequestTimeZone()
  ]);
  const copy = discussionCopy[interfaceLocale];
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
  const posts = problem.thread?.posts ?? [];
  const [postVoteGroups, userVotes] = await Promise.all([
    posts.length
      ? prisma.vote.groupBy({
          by: ["targetId"],
          where: { targetType: TargetType.POST, targetId: { in: posts.map((post) => post.id) } },
          _count: { targetId: true }
        })
      : Promise.resolve([]),
    user && posts.length
      ? prisma.vote.findMany({
          where: {
            userId: user.id,
            targetType: TargetType.POST,
            targetId: { in: posts.map((post) => post.id) }
          },
          select: { targetId: true }
        })
      : Promise.resolve([])
  ]);

  const postVotes = new Map(postVoteGroups.map((item) => [item.targetId, item._count.targetId]));
  const ownPostVoteIds = new Set(userVotes.map((vote) => vote.targetId));
  const ownDiscussionPostResetSignal =
    user && problem.thread ? posts.filter((post) => post.authorId === user.id).at(-1)?.id ?? 0 : 0;
  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? undefined
  });

  return (
    <ForestPageLayout
      className="discussion-page discussion-page-problem"
      title={<AsyncMarkdownInline markdown={problem.title} />}
      eyebrow={t.problemDetail.discussions}
      heroImage="/art/hero-rye.jpg"
      heroAlt="Ivan Shishkin, Rye (1878)"
      description={copy.messages(posts.length)}
      titleBelowHero
      workspaceClassName="discussion-page-workspace"
      actions={
        <Link href={`/problems/${problem.slug}`} className="button secondary discussion-back-link">
          <ArrowLeft size={17} aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      {!user && (
        <p className="discussion-sign-in">
          <SignInLink>{t.nav.signIn}</SignInLink> {copy.join}
        </p>
      )}

      <section className="discussion-thread" aria-label={t.problemDetail.discussions}>
        {posts.map((post) => {
          const canManageHint = Boolean(user && post.type === "HINT" && canEditDiscussionHint(user, post));
          const hasUsefulVote = ownPostVoteIds.has(post.id);

          return (
            <article key={post.id} className={`discussion-post${post.type === "HINT" ? " discussion-post-hint" : ""}`}>
              <header className="discussion-post-header">
                <div className="discussion-post-author">
                  <Link href={`/profile/${post.author.username}`}>
                    <UserName user={post.author} />
                  </Link>
                  <span className="discussion-post-byline">{copy.by}</span>
                  <time dateTime={post.createdAt.toISOString()}>{dateFormatter.format(post.createdAt)}</time>
                </div>
                <div className="discussion-post-header-actions">
                  {post.type === "HINT" && (
                    <span className="discussion-hint-badge">
                      <Lightbulb size={14} aria-hidden="true" />
                      {copy.hint}
                    </span>
                  )}
                  {user && (
                    <form action={votePostAction.bind(null, post.id, problem.slug, true)}>
                      <button
                        type="submit"
                        className={`discussion-useful-button${hasUsefulVote ? " is-active" : ""}`}
                        aria-pressed={hasUsefulVote}
                        title={hasUsefulVote ? copy.removeUseful : copy.markUseful}
                      >
                        <ThumbsUp size={15} aria-hidden="true" />
                        <span>{postVotes.get(post.id) ?? 0}</span>
                      </button>
                    </form>
                  )}
                </div>
              </header>

              <div className="discussion-post-body">
                {post.type === "HINT" ? <HiddenHint postId={post.id} /> : <MarkdownBlock html={post.bodyHtml} />}
              </div>

              {(canManageHint || user) && (
                <footer className="discussion-post-footer">
                  {canManageHint && (
                    <>
                      <details>
                        <summary>
                          <Pencil size={14} aria-hidden="true" />
                          {copy.editHint}
                        </summary>
                        <form action={updateHintAction.bind(null, post.id, problem.slug, true)} className="discussion-inline-form">
                          <LazyMarkdownEditor
                            name="bodyMarkdown"
                            initialValue={post.bodyMarkdown}
                            minHeight="7rem"
                            lineNumbers={false}
                          />
                          <button type="submit" className="secondary">
                            {copy.saveHint}
                          </button>
                        </form>
                      </details>
                      <form action={deleteHintAction.bind(null, post.id, problem.slug, true)}>
                        <button type="submit" className="discussion-text-action discussion-delete-action">
                          <Trash2 size={14} aria-hidden="true" />
                          {copy.deleteHint}
                        </button>
                      </form>
                    </>
                  )}
                  {user && (
                    <details className="discussion-report">
                      <summary>
                        <Flag size={14} aria-hidden="true" />
                        {copy.report}
                      </summary>
                      <form action={reportPostAction.bind(null, post.id, problem.slug)} className="discussion-inline-form">
                        <textarea name="reason" placeholder={copy.reportPlaceholder} required />
                        <button type="submit" className="secondary">
                          {copy.submitReport}
                        </button>
                      </form>
                    </details>
                  )}
                </footer>
              )}
            </article>
          );
        })}

        {posts.length === 0 && (
          <div className="discussion-empty-state">
            <MessageCircle size={25} aria-hidden="true" />
            <p>{copy.noMessages}</p>
          </div>
        )}
      </section>

      {user && (
        <form action={createDiscussionPostAction.bind(null, problem.id, true)} className="discussion-composer">
          <h2>
            <MessageSquarePlus size={19} aria-hidden="true" />
            {copy.add}
          </h2>
          <LazyMarkdownEditor
            name="bodyMarkdown"
            minHeight="9rem"
            lineNumbers={false}
            draftKey={`problem-discussion:${problem.id}:reply`}
            resetSignal={ownDiscussionPostResetSignal}
          />
          <div className="discussion-composer-actions">
            <button type="submit">
              <Send size={16} aria-hidden="true" />
              {copy.post}
            </button>
          </div>
        </form>
      )}
    </ForestPageLayout>
  );
}
