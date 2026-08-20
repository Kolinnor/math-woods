import { ProblemVerificationMode, ReportStatus, TargetType } from "@prisma/client";
import { ArrowLeft, Flag, MessageCircle, MessageSquarePlus, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { SignInLink } from "@/components/SignInLink";
import { UserName } from "@/components/UserName";
import { reportProofAction } from "@/lib/actions/moderation-actions";
import { createProofCommentAction } from "@/lib/actions/proof-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import {
  canEditProblem,
  canViewArchivedProblem,
  isVerifiedContributor
} from "@/lib/permissions";
import { canViewProblemSolutions } from "@/lib/problem-solution-visibility";
import { canViewProblem } from "@/lib/problem-visibility";
import { getRequestTimeZone } from "@/lib/server-time-zone";
import { renderMarkdownCollectionForContentLanguage } from "@/lib/translated-markdown";

export const dynamic = "force-dynamic";

const discussionCopy = {
  en: {
    add: "Add to the discussion",
    back: "Back to problem",
    by: "by",
    join: "to join the discussion.",
    messages: (count: number) => `${count} ${count === 1 ? "message" : "messages"}`,
    noMessages: "No messages yet.",
    post: "Post",
    solution: "Solution",
    verify: "Verify your email to join the discussion."
  },
  fr: {
    add: "Ajouter à la discussion",
    back: "Retour au problème",
    by: "par",
    join: "pour participer à la discussion.",
    messages: (count: number) => `${count} message${count === 1 ? "" : "s"}`,
    noMessages: "Aucun message pour l'instant.",
    post: "Publier",
    solution: "Solution",
    verify: "Vérifiez votre adresse e-mail pour participer à la discussion."
  }
} as const;

export default async function SolutionDiscussionPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; proofId: string }>;
  searchParams?: Promise<{ report?: string }>;
}) {
  const { slug, proofId: proofIdParam } = await params;
  const query = searchParams ? await searchParams : {};
  const proofId = Number(proofIdParam);
  if (!Number.isInteger(proofId) || proofId <= 0) notFound();

  const [t, interfaceLocale, user, timeZone] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getCurrentUser(),
    getRequestTimeZone()
  ]);
  const copy = discussionCopy[interfaceLocale];
  const proof = await prisma.problemProof.findFirst({
    where: { id: proofId, problem: { slug } },
    include: {
      author: true,
      translatedBy: true,
      comments: {
        include: { author: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      },
      problem: {
        include: { author: true }
      }
    }
  });

  if (!proof) notFound();
  const problem = proof.problem;
  if (problem.status === "ARCHIVED" && !canViewArchivedProblem(user, problem)) notFound();
  if (!canViewProblem(user, problem)) notFound();

  const [solvedAttempt, ownOpenReport, renderedSolution] = await Promise.all([
    user
      ? prisma.problemAttempt.findFirst({
          where: {
            userId: user.id,
            status: "SOLVED",
            problem: { translationGroupId: problem.translationGroupId }
          },
          select: { id: true }
        })
      : null,
    user
      ? prisma.report.findFirst({
          where: {
            reporterId: user.id,
            targetType: TargetType.PROOF,
            targetId: proof.id,
            status: ReportStatus.OPEN
          },
          select: { category: true, reason: true }
        })
      : null,
    renderMarkdownCollectionForContentLanguage([proof.bodyMarkdown], problem.language)
  ]);

  const canEditCurrentProblem = Boolean(user && canEditProblem(user, problem));
  const canViewSolution = canViewProblemSolutions({
    requiresVerification: problem.verificationMode !== ProblemVerificationMode.NONE,
    hasSolvedAttempt: Boolean(solvedAttempt),
    canEditProblem: canEditCurrentProblem
  });
  if (!canViewSolution) notFound();

  const isOwnProof = user?.id === proof.authorId || user?.id === proof.translatedById;
  const canContribute = Boolean(user && isVerifiedContributor(user));
  const canReport = Boolean(canContribute && !isOwnProof);
  const ownCommentResetSignal = user
    ? proof.comments.filter((comment) => comment.authorId === user.id).at(-1)?.id ?? 0
    : 0;
  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? undefined
  });

  return (
    <ForestPageLayout
      className="discussion-page discussion-page-problem solution-discussion-page"
      title={<AsyncMarkdownInline markdown={problem.title} />}
      eyebrow={t.problemDetail.discussions}
      heroImage="/art/hero-rye.jpg"
      heroAlt="Ivan Shishkin, Rye (1878)"
      description={copy.messages(proof.comments.length)}
      titleBelowHero
      workspaceClassName="discussion-page-workspace"
      actions={
        <Link href={`/problems/${problem.slug}#solution-${proof.id}`} className="button secondary discussion-back-link">
          <ArrowLeft size={17} aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      <article className="discussion-solution" aria-labelledby="solution-discussion-heading">
        <header className="discussion-solution-header">
          <h2 id="solution-discussion-heading">{copy.solution}</h2>
          <p className="meta">
            {t.problemDetail.solutionBy}{" "}
            <Link href={`/profile/${proof.author.profileSlug}`}>
              <UserName user={proof.author} />
            </Link>
            {proof.translatedBy && (
              <>
                {" · "}{t.translations.translatedBy}{" "}
                <Link href={`/profile/${proof.translatedBy.profileSlug}`}>
                  <UserName user={proof.translatedBy} />
                </Link>
              </>
            )}
          </p>
        </header>
        <div className="discussion-solution-body">
          <MarkdownBlock html={renderedSolution[0] ?? proof.bodyHtml} />
        </div>
      </article>

      {!user && (
        <p className="discussion-sign-in">
          <SignInLink>{t.nav.signIn}</SignInLink> {copy.join}
        </p>
      )}
      {user && !canContribute && <p className="discussion-sign-in">{copy.verify}</p>}

      <section className="discussion-thread solution-comment-thread" aria-label={t.problemDetail.discussions}>
        {proof.comments.map((comment) => (
          <article id={`comment-${comment.id}`} key={comment.id} className="discussion-post">
            <header className="discussion-post-header">
              <div className="discussion-post-author">
                <Link href={`/profile/${comment.author.profileSlug}`}>
                  <UserName user={comment.author} />
                </Link>
                <span className="discussion-post-byline">{copy.by}</span>
                <time dateTime={comment.createdAt.toISOString()}>{dateFormatter.format(comment.createdAt)}</time>
              </div>
            </header>
            <div className="discussion-post-body">
              <MarkdownBlock html={comment.bodyHtml} />
            </div>
          </article>
        ))}

        {proof.comments.length === 0 && (
          <div className="discussion-empty-state">
            <MessageCircle size={25} aria-hidden="true" />
            <p>{copy.noMessages}</p>
          </div>
        )}
      </section>

      {canContribute && (
        <form
          action={createProofCommentAction.bind(null, proof.id, problem.slug)}
          className="discussion-composer"
        >
          <h2>
            <MessageSquarePlus size={19} aria-hidden="true" />
            {copy.add}
          </h2>
          <LazyMarkdownEditor
            name="bodyMarkdown"
            minHeight="9rem"
            lineNumbers={false}
            draftKey={`solution-discussion:${proof.id}:reply`}
            resetSignal={ownCommentResetSignal}
          />
          <div className="discussion-composer-actions">
            <button type="submit">
              <Send size={16} aria-hidden="true" />
              {copy.post}
            </button>
          </div>
        </form>
      )}

      {canReport && (
        <details
          id="report-solution"
          className="solution-report-control discussion-solution-report"
          open={query.report === "saved"}
        >
          <summary>
            <Flag size={14} aria-hidden="true" />
            {ownOpenReport ? t.problemDetail.updateSolutionReport : t.problemDetail.reportSolution}
          </summary>
          <form
            action={reportProofAction.bind(null, proof.id, problem.slug)}
            className="solution-report-form"
          >
            {query.report === "saved" && (
              <p className="success-text" role="status" aria-live="polite">
                {t.problemDetail.solutionReportSaved}
              </p>
            )}
            <label>
              <span>{t.problemDetail.solutionReportReason}</span>
              <select name="category" defaultValue={ownOpenReport?.category ?? "MATHEMATICAL_ERROR"}>
                <option value="MATHEMATICAL_ERROR">
                  {t.problemDetail.solutionReportReasons.mathematicalError}
                </option>
                <option value="INCOMPLETE_ARGUMENT">
                  {t.problemDetail.solutionReportReasons.incompleteArgument}
                </option>
                <option value="UNCLEAR_EXPLANATION">
                  {t.problemDetail.solutionReportReasons.unclearExplanation}
                </option>
                <option value="IRRELEVANT_OR_ABUSIVE">
                  {t.problemDetail.solutionReportReasons.irrelevantOrAbusive}
                </option>
                <option value="OTHER">{t.problemDetail.solutionReportReasons.other}</option>
              </select>
            </label>
            <label>
              <span>{t.problemDetail.solutionReportExplanation}</span>
              <textarea
                name="reason"
                defaultValue={ownOpenReport?.reason ?? ""}
                placeholder={t.problemDetail.solutionReportPlaceholder}
                minLength={10}
                maxLength={4000}
                required
              />
            </label>
            <div className="solution-report-submit">
              <small>{t.problemDetail.solutionReportGuidance}</small>
              <button type="submit" className="secondary">
                <Flag size={15} aria-hidden="true" />
                {t.problemDetail.submitSolutionReport}
              </button>
            </div>
          </form>
        </details>
      )}
    </ForestPageLayout>
  );
}
