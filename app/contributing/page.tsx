import { ContributionRequestStatus } from "@prisma/client";
import type { Route } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import {
  claimContributionRequestAction,
  completeContributionRequestAction,
  releaseContributionRequestAction
} from "@/lib/actions/contribution-request-actions";
import { getCurrentUser } from "@/lib/auth";
import { loadRenderedContributionPage } from "@/lib/contribution-page";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools, canUseModerationTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function requestKindLabel(kind: "PROBLEM" | "CONCEPT", labels: { problemRequest: string; conceptRequest: string }) {
  return kind === "PROBLEM" ? labels.problemRequest : labels.conceptRequest;
}

function requestStatusLabel(status: ContributionRequestStatus, labels: { open: string; inProgress: string; completed: string }) {
  if (status === ContributionRequestStatus.CLAIMED) return labels.inProgress;
  if (status === ContributionRequestStatus.COMPLETED) return labels.completed;
  return labels.open;
}

export default async function ContributingPage({
  searchParams
}: {
  searchParams?: Promise<{ request?: string }>;
}) {
  const [user, contributionPage, activeRequests, completedRequests, params, t, locale] = await Promise.all([
    getCurrentUser(),
    loadRenderedContributionPage(),
    prisma.contributionRequest.findMany({
      where: { status: { not: ContributionRequestStatus.COMPLETED } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 60,
      include: { requester: true, claimedBy: true }
    }),
    prisma.contributionRequest.findMany({
      where: { status: ContributionRequestStatus.COMPLETED },
      orderBy: { completedAt: "desc" },
      take: 12,
      include: { requester: true, claimedBy: true }
    }),
    searchParams ? searchParams : Promise.resolve({} as { request?: string }),
    getTranslations(),
    getInterfaceLocale()
  ]);
  const labels = t.contributingPage;
  const canManageRequests = Boolean(user && canUseModerationTools(user));
  const canAdminRequests = Boolean(user && canUseAdminTools(user));
  const canEditPage = Boolean(user && canUseAdminTools(user));
  const allRequests = [...activeRequests, ...completedRequests];
  const openRequestCount = activeRequests.filter((request) => request.status === ContributionRequestStatus.OPEN).length;
  const claimedRequestCount = activeRequests.filter((request) => request.status === ContributionRequestStatus.CLAIMED).length;

  return (
    <ForestPageLayout
      title={contributionPage.content.title}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      meta={<p>{labels.requestCount(allRequests.length)}</p>}
      actions={
        <>
          <Link href={"/contributing/tasks" as Route} className="button">
            {labels.workRemaining}
          </Link>
          {canEditPage && (
            <Link href={"/contributing/edit" as Route} className="button secondary">
              {labels.editPage}
            </Link>
          )}
        </>
      }
    >
      <div className="mt-8 grid gap-7">
        {contributionPage.sections.map((section, index) =>
          index === 0 ? (
            <section key={section.id ?? section.position} className="growth-note">
              <strong>{section.title}</strong>
              <MarkdownBlock html={section.bodyHtml} />
            </section>
          ) : null
        )}

        <section id="requests" className="contribution-request-board">
          <div className="contribution-request-board-header">
            <div>
              <p className="section-eyebrow">{contributionPage.content.requestEyebrow}</p>
              <h2>{contributionPage.content.requestTitle}</h2>
            </div>
            <div className="contribution-request-stats" aria-label={labels.summaryLabel}>
              <span>{labels.openCount(openRequestCount)}</span>
              <span>{labels.inProgressCount(claimedRequestCount)}</span>
              <span>{labels.recentCompletedCount(completedRequests.length)}</span>
            </div>
          </div>
          <p className="contribution-request-board-intro">{contributionPage.content.requestIntro}</p>
          {params.request === "created" && (
            <p className="success-banner mt-4" role="status">
              {labels.requestAdded}
            </p>
          )}
          <div className="contribution-requests mt-4">
            {allRequests.map((request) => {
              const isAssignee = user?.id === request.claimedById;
              const canRelease = canManageRequests && request.status === ContributionRequestStatus.CLAIMED && (isAssignee || canAdminRequests);
              const canComplete = canRelease;
              const canClaim = canManageRequests && request.status === ContributionRequestStatus.OPEN;
              const hasRequestActions = canClaim || canComplete || canRelease;

              return (
                <article key={request.id} className="contribution-request-card">
                  <div className="contribution-request-card-main">
                    <div className="flex flex-wrap gap-2">
                      <span className="tag contribution-request-kind">{requestKindLabel(request.kind, labels)}</span>
                      <span className="tag contribution-request-status">{requestStatusLabel(request.status, labels)}</span>
                    </div>
                    <p>{request.body}</p>
                    <p className="meta">
                      {labels.requestedBy} {request.requester ? <UserName user={request.requester} /> : labels.deletedUser} /{" "}
                      {request.createdAt.toLocaleDateString(locale)}
                      {request.claimedBy && <> / {labels.handledBy} <UserName user={request.claimedBy} /></>}
                    </p>
                  </div>
                  {hasRequestActions && (
                    <div className="contribution-request-actions">
                      {canClaim && (
                        <form action={claimContributionRequestAction.bind(null, request.id)}>
                          <button type="submit">{labels.claim}</button>
                        </form>
                      )}
                      {canComplete && (
                        <form action={completeContributionRequestAction.bind(null, request.id)}>
                          <button type="submit" className="secondary">
                            {labels.markComplete}
                          </button>
                        </form>
                      )}
                      {canRelease && (
                        <form action={releaseContributionRequestAction.bind(null, request.id)}>
                          <button type="submit" className="secondary">
                            {labels.release}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {allRequests.length === 0 && <p className="muted panel p-5">{labels.noRequests}</p>}
          </div>
        </section>

        {contributionPage.sections.slice(1).map((section) => (
          <section key={section.id ?? section.position} className="contribution-page-section">
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <MarkdownBlock html={section.bodyHtml} />
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
        <Link href="/concepts/new" className="button secondary">
          {labels.addConcept}
        </Link>
        <Link href="/problems?quality=NEEDS_WORK" className="button secondary">
          {labels.improveProblems}
        </Link>
        <Link href="/recent-changes" className="button secondary">
          {labels.recentChanges}
        </Link>
      </div>
    </ForestPageLayout>
  );
}
