import { ContributionRequestStatus } from "@prisma/client";
import Link from "next/link";
import {
  claimContributionRequestAction,
  completeContributionRequestAction,
  releaseContributionRequestAction
} from "@/lib/actions/contribution-request-actions";
import { getCurrentUser } from "@/lib/auth";
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
  const [user, activeRequests, completedRequests, params] = await Promise.all([
    getCurrentUser(),
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
  const allRequests = [...activeRequests, ...completedRequests];

  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">Contribution guidelines</h1>
      <p className="muted mt-2">
        Math Woods should feel like an old map being filled in: rough paths, missing clearings, margin notes, better routes.
      </p>

      <div className="mt-8 grid gap-7">
        <section className="growth-note">
          <strong>Do not wait for perfection.</strong>
          <span>
            A clean problem, a stub concept, a source note, a partial solution, or a correction request can already help.
          </span>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Make rough work visible</h2>
          <p className="mt-2">
            Mark unfinished material honestly. Use <strong>Needs work</strong>, stub statuses, talk pages, edit
            summaries, and reports. A rough page with clear uncertainty is useful.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Keep barriers low</h2>
          <p className="mt-2">
            Beginners should be able to add examples, ask for clarification, report copied wording, propose a better
            hint, or create a missing concept.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Write for verification</h2>
          <p className="mt-2">
            Cite reliable textbooks, papers, lecture notes, or established reference works when a claim needs support.
            If the source is uncertain, say so. Uncertainty is useful when it is visible.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Prefer clarity over completeness</h2>
          <p className="mt-2">
            A useful first version can be short. Add definitions, examples, counterexamples, solutions, and links when
            they are ready.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Make edits accountable</h2>
          <p className="mt-2">
            Use concise edit summaries. For disputed scope, terminology, or sources, discuss the change on the talk
            page before repeatedly rewriting it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Use reports without making them scary</h2>
          <p className="mt-2">
            Reports are not only for emergencies. They can flag copied wording, questionable origins, wrong statements,
            spoilers, or pages that need attention.
          </p>
        </section>

        <section id="requests">
          <h2 className="text-xl font-semibold">Requests</h2>
          <p className="mt-2">
            If you would like to see a problem or concept page on a particular notion, leave a request from the problem
            or concept browser. Trusted contributors can claim a request, work on it, release it if they stop, and mark
            it complete when the page or problem exists.
          </p>
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
                      <span className="tag">{requestKindLabel(request.kind)}</span>
                      <span className="tag">{requestStatusLabel(request.status)}</span>
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
    </article>
  );
}
