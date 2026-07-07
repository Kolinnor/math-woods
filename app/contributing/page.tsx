import { ContributionRequestStatus } from "@prisma/client";
import type { Route } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import {
  claimContributionRequestAction,
  completeContributionRequestAction,
  releaseContributionRequestAction
} from "@/lib/actions/contribution-request-actions";
import { getCurrentUser } from "@/lib/auth";
import { loadRenderedContributionPage } from "@/lib/contribution-page";
import { prisma } from "@/lib/db";
import { canUseAdminTools, canUseModerationTools } from "@/lib/permissions";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function requestKindLabel(kind: "PROBLEM" | "CONCEPT") {
  return kind === "PROBLEM" ? "Problem request" : "Concept request";
}

function requestStatusLabel(status: ContributionRequestStatus) {
  if (status === ContributionRequestStatus.CLAIMED) return "In progress";
  if (status === ContributionRequestStatus.COMPLETED) return "Completed";
  return "Open";
}

export default async function ContributingPage({
  searchParams
}: {
  searchParams?: Promise<{ request?: string }>;
}) {
  const [user, contributionPage, activeRequests, completedRequests, params] = await Promise.all([
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
    searchParams ? searchParams : Promise.resolve({} as { request?: string })
  ]);
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
      meta={<p>{allRequests.length} open or recent requests</p>}
      actions={
        canEditPage && (
          <Link href={"/contributing/edit" as Route} className="button secondary">
            Edit page
          </Link>
        )
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
            <div className="contribution-request-stats" aria-label="Contribution request summary">
              <span>{openRequestCount} open</span>
              <span>{claimedRequestCount} in progress</span>
              <span>{completedRequests.length} recent completed</span>
            </div>
          </div>
          <p className="contribution-request-board-intro">{contributionPage.content.requestIntro}</p>
          {params.request === "created" && (
            <p className="success-banner mt-4" role="status">
              Your request was added.
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
                      <span className="tag contribution-request-kind">{requestKindLabel(request.kind)}</span>
                      <span className="tag contribution-request-status">{requestStatusLabel(request.status)}</span>
                    </div>
                    <p>{request.body}</p>
                    <p className="meta">
                      Requested by {request.requester ? displayNameForUser(request.requester) : "a deleted user"} /{" "}
                      {request.createdAt.toLocaleDateString("en-US")}
                      {request.claimedBy && <> / handled by {displayNameForUser(request.claimedBy)}</>}
                    </p>
                  </div>
                  {hasRequestActions && (
                    <div className="contribution-request-actions">
                      {canClaim && (
                        <form action={claimContributionRequestAction.bind(null, request.id)}>
                          <button type="submit">I'll work on this</button>
                        </form>
                      )}
                      {canComplete && (
                        <form action={completeContributionRequestAction.bind(null, request.id)}>
                          <button type="submit" className="secondary">
                            Mark complete
                          </button>
                        </form>
                      )}
                      {canRelease && (
                        <form action={releaseContributionRequestAction.bind(null, request.id)}>
                          <button type="submit" className="secondary">
                            Release
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {allRequests.length === 0 && <p className="muted panel p-5">No requests yet.</p>}
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
          Add a concept
        </Link>
        <Link href="/problems?quality=NEEDS_WORK" className="button secondary">
          Improve problems
        </Link>
        <Link href="/recent-changes" className="button secondary">
          Recent changes
        </Link>
      </div>
    </ForestPageLayout>
  );
}
