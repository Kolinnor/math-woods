import { NotificationType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/app/settings/ConfirmSubmitButton";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import {
  createVerificationMessageAction,
  deleteVerificationMessageAction,
  reviewProblemVerificationAction,
  updateVerificationMessageAction
} from "@/lib/actions/problem-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import {
  canEditVerificationMessage,
  canJoinVerificationDiscussion,
  canReviewProblemVerification,
  canViewArchivedProblem
} from "@/lib/permissions";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function verificationStatusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function ProblemVerificationPage({
  params
}: {
  params: Promise<{ slug: string; requestId: string }>;
}) {
  const { slug, requestId } = await params;
  const t = await getTranslations();
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
      user: { select: { id: true, username: true, displayName: true } },
      reviewer: { select: { id: true, username: true, displayName: true } },
      messages: {
        include: { author: { select: { id: true, username: true, displayName: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!request || request.problem.slug !== slug) notFound();
  if (request.problem.status === "ARCHIVED" && !canViewArchivedProblem(user, request.problem)) notFound();
  if (!user || !canJoinVerificationDiscussion(user, request)) notFound();
  await markNotificationsReadForHref(user.id, `/problems/${request.problem.slug}/verification/${request.id}`, [
    NotificationType.VERIFICATION_REQUESTED,
    NotificationType.VERIFICATION_MESSAGE,
    NotificationType.VERIFICATION_APPROVED,
    NotificationType.VERIFICATION_REJECTED
  ]);

  const canReview = canReviewProblemVerification(user, request.problem);
  const isPending = request.status === "PENDING";
  const ownReplyResetSignal = request.messages.filter((message) => message.authorId === user.id).at(-1)?.id ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="muted text-sm">Private solution review</p>
          <h1 className="text-2xl font-bold">
            <AsyncMarkdownInline markdown={request.problem.title} />
          </h1>
          <p className="muted mt-1 text-sm">
            {verificationStatusLabel(request.status)} review requested by{" "}
            <Link href={`/profile/${request.user.username}`} className="underline">
              {displayNameForUser(request.user)}
            </Link>
          </p>
        </div>
        <Link href={`/problems/${request.problem.slug}`} className="button secondary">
          Problem
        </Link>
      </div>

      <section className="verification-page-grid">
        <div className="grid gap-4">
          <section className="verification-submission">
            <strong>Submitted answer</strong>
            <p>{request.answer}</p>
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Private discussion</h2>
                <p className="muted text-sm">
                  {request.messages.length
                    ? `${request.messages.length} ${request.messages.length === 1 ? "message" : "messages"}`
                    : t.problemDetail.noMessagesYet}
                </p>
              </div>
              {request.reviewer && (
                <p className="muted text-sm">
                  Reviewed by{" "}
                  <Link href={`/profile/${request.reviewer.username}`} className="underline">
                    {displayNameForUser(request.reviewer)}
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
                      {displayNameForUser(message.author)} {"\u00b7"} {message.createdAt.toLocaleString("en-US")}
                    </p>
                    <MarkdownBlock html={message.bodyHtml} />
                    {canEditMessage && (
                      <div className="mt-3 grid gap-3 text-sm">
                        <details>
                          <summary className="cursor-pointer font-medium">Edit message</summary>
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
                              Save message
                            </button>
                          </form>
                        </details>
                        <form action={deleteVerificationMessageAction.bind(null, message.id, request.problem.slug)}>
                          <ConfirmSubmitButton className="secondary" message="Delete this message?">
                            Delete message
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
              <h2 className="font-semibold">Reply privately</h2>
              <LazyMarkdownEditor
                name="bodyMarkdown"
                minHeight="9rem"
                lineNumbers={false}
                draftKey={`verification-request:${request.id}:reply`}
                resetSignal={ownReplyResetSignal}
              />
              <button type="submit">Post reply</button>
            </form>
          ) : (
            <p className="panel muted p-5">This verification request is closed.</p>
          )}
        </div>

        <aside className="verification-page-rail">
          <section className="panel p-4">
            <h2 className="font-semibold">Review</h2>
            <p className="muted mt-1 text-sm">Status: {verificationStatusLabel(request.status)}</p>
            {isPending && canReview && (
              <div className="mt-4 grid gap-2">
                <form action={reviewProblemVerificationAction.bind(null, request.id, "APPROVED")}>
                  <button type="submit" className="w-full">
                    Approve answer
                  </button>
                </form>
                <form action={reviewProblemVerificationAction.bind(null, request.id, "REJECTED")}>
                  <button type="submit" className="secondary w-full">
                    Close as not accepted
                  </button>
                </form>
              </div>
            )}
            {!canReview && (
              <p className="muted mt-4 text-sm">
                The problem author can approve or close this review.
              </p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
