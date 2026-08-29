import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/app/settings/ConfirmSubmitButton";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import {
  createVerificationMessageAction,
  deleteVerificationMessageAction,
  reviewProblemVerificationAction,
  updateVerificationMessageAction
} from "@/lib/actions/problem-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import {
  canEditVerificationMessage,
  canJoinVerificationDiscussion,
  canReviewProblemVerification,
  canViewArchivedProblem
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ProblemVerificationPage({
  params
}: {
  params: Promise<{ slug: string; requestId: string }>;
}) {
  const { slug, requestId } = await params;
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const user = await getCurrentUser();
  const numericRequestId = Number.parseInt(requestId, 10);
  if (!Number.isInteger(numericRequestId)) notFound();

  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: numericRequestId },
    include: {
      problem: {
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          authorId: true,
          author: true
        }
      },
      user: {
        select: { id: true, username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true }
      },
      reviewer: {
        select: { id: true, username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true }
      },
      messages: {
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, avatarBackground: true }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!request || request.problem.slug !== slug) notFound();
  if (request.problem.status === "ARCHIVED" && !canViewArchivedProblem(user, request.problem)) notFound();
  if (!user || !canJoinVerificationDiscussion(user, request)) notFound();
  const canReview = canReviewProblemVerification(user, request.problem);
  const isPending = request.status === "PENDING";
  const statusLabel = t.problemDetail.verificationStatuses[request.status];
  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const ownReplyResetSignal = request.messages.filter((message) => message.authorId === user.id).at(-1)?.id ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="muted text-sm">{t.problemDetail.privateSolutionReview}</p>
          <h1 className="text-2xl font-bold">
            <AsyncMarkdownInline markdown={request.problem.title} />
          </h1>
          <p className="muted mt-1 text-sm">
            {t.problemDetail.reviewRequestedBy(statusLabel)}{" "}
            <Link href={`/profile/${request.user.profileSlug}`} className="underline">
              <UserName user={request.user} />
            </Link>
          </p>
        </div>
        <Link href={`/problems/${request.problem.slug}`} className="button secondary">
          {t.problemDetail.problem}
        </Link>
      </div>

      <section className="verification-page-grid">
        <div className="grid gap-4">
          <section className="verification-submission">
            <strong>{t.problemDetail.submittedAnswer}</strong>
            <p>{request.answer}</p>
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t.problemDetail.privateDiscussion}</h2>
                <p className="muted text-sm">
                  {request.messages.length ? t.problemDetail.messages(request.messages.length) : t.problemDetail.noMessagesYet}
                </p>
              </div>
              {request.reviewer && (
                <p className="muted text-sm">
                  {t.problemDetail.reviewedBy}{" "}
                  <Link href={`/profile/${request.reviewer.profileSlug}`} className="underline">
                    <UserName user={request.reviewer} />
                  </Link>
                </p>
              )}
            </div>

            <div className="verification-messages">
              {request.messages.map((message) => {
                const canEditMessage = canEditVerificationMessage(user, message);

                return (
                  <article key={message.id} className="verification-message">
                    <p className="meta">
                      <UserName user={message.author} /> {"\u00b7"} {dateFormatter.format(message.createdAt)}
                    </p>
                    <MarkdownBlock html={message.bodyHtml} />
                    {canEditMessage && (
                      <div className="mt-3 grid gap-3 text-sm">
                        <details>
                          <summary className="cursor-pointer font-medium">{t.problemDetail.editMessage}</summary>
                          <form
                            action={updateVerificationMessageAction.bind(null, message.id, request.problem.slug)}
                            className="mt-3 grid gap-2"
                          >
                            <LazyMarkdownEditor
                              name="bodyMarkdown"
                              initialValue={message.bodyMarkdown}
                              minHeight="7rem"
                              lineNumbers={false}
                              draftKey={`verification-message:${message.id}:edit`}
                            />
                            <button type="submit" className="secondary">
                              {t.problemDetail.saveMessage}
                            </button>
                          </form>
                        </details>
                        <form action={deleteVerificationMessageAction.bind(null, message.id, request.problem.slug)}>
                          <ConfirmSubmitButton className="secondary" message={t.problemDetail.deleteMessageConfirm}>
                            {t.problemDetail.deleteMessage}
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    )}
                  </article>
                );
              })}
              {request.messages.length === 0 && <p className="muted">{t.problemDetail.noMessagesYet}</p>}
            </div>
          </section>

          {isPending ? (
            <form action={createVerificationMessageAction.bind(null, request.id, request.problem.slug)} className="panel grid gap-3 p-5">
              <h2 className="font-semibold">{t.problemDetail.replyPrivately}</h2>
              <LazyMarkdownEditor
                name="bodyMarkdown"
                minHeight="9rem"
                lineNumbers={false}
                draftKey={`verification-request:${request.id}:reply`}
                resetSignal={ownReplyResetSignal}
              />
              <button type="submit">{t.problemDetail.postReply}</button>
            </form>
          ) : (
            <p className="panel muted p-5">{t.problemDetail.verificationRequestClosed}</p>
          )}
        </div>

        <aside className="verification-page-rail">
          <section className="panel p-4">
            <h2 className="font-semibold">{t.problemDetail.review}</h2>
            <p className="muted mt-1 text-sm">{t.problemDetail.status}: {statusLabel}</p>
            {isPending && canReview && (
              <div className="mt-4 grid gap-2">
                <form action={reviewProblemVerificationAction.bind(null, request.id, "APPROVED")}>
                  <button type="submit" className="w-full">
                    {t.problemDetail.approveAnswer}
                  </button>
                </form>
                <form action={reviewProblemVerificationAction.bind(null, request.id, "REJECTED")}>
                  <button type="submit" className="secondary w-full">
                    {t.problemDetail.closeNotAccepted}
                  </button>
                </form>
              </div>
            )}
            {!canReview && (
              <p className="muted mt-4 text-sm">
                {t.problemDetail.authorReviewPermission}
              </p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
