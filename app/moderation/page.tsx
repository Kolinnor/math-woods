import { ConceptMergeStatus, Role } from "@prisma/client";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { UserName } from "@/components/UserName";
import { markErrorReportReviewedAction } from "@/lib/actions/error-report-actions";
import {
  dismissReportAction,
  hideReportedPostAction,
  hideReportedProblemAction,
  markConceptUsableAction,
  markReportedProblemNeedsWorkAction,
  markReportedConceptControversialAction,
  publishProblemAction,
  resolveReportedProofAction
} from "@/lib/actions/moderation-actions";
import {
  cancelSiteAnnouncementAction,
  sendSiteAnnouncementAction
} from "@/lib/actions/site-announcement-actions";
import { requireModerator } from "@/lib/auth";
import { formatUserDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { qualityLabel } from "@/lib/quality";
import { canUseAdminTools, canUseOwnerTools } from "@/lib/permissions";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

type ModerationPageProps = {
  searchParams?: Promise<{
    announcementSent?: string;
    announcementError?: string;
  }>;
};

export default async function ModerationPage({ searchParams }: ModerationPageProps) {
  const user = await requireModerator();
  const canReviewProposedEdits = canUseAdminTools(user);
  const canSendSiteAnnouncements = canUseOwnerTools(user);
  const [timeZone, rawQueryParams] = await Promise.all([
    getRequestTimeZone(),
    searchParams ?? Promise.resolve({})
  ]);
  const queryParams = rawQueryParams as { announcementSent?: string; announcementError?: string };

  const recentAnnouncements = canSendSiteAnnouncements
    ? await prisma.siteAnnouncement.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { _count: { select: { recipients: true } } }
      })
    : [];
  const acknowledgedByAnnouncement = recentAnnouncements.length > 0
    ? new Map((await prisma.siteAnnouncementRecipient.groupBy({
        by: ["announcementId"],
        where: {
          announcementId: { in: recentAnnouncements.map(({ id }) => id) },
          acknowledgedAt: { not: null }
        },
        _count: { _all: true }
      })).map((row) => [row.announcementId, row._count._all]))
    : new Map<number, number>();
  const conceptMergeProposals = await prisma.conceptMergeProposal.findMany({
    where: { status: ConceptMergeStatus.PENDING },
    orderBy: { createdAt: "asc" },
    include: { proposedBy: true },
    take: 100
  });

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: { reporter: true },
    take: 100
  });

  const problemIds = reports.filter((report) => report.targetType === "PROBLEM").map((report) => report.targetId);
  const conceptIds = reports.filter((report) => report.targetType === "CONCEPT").map((report) => report.targetId);
  const postIds = reports.filter((report) => report.targetType === "POST").map((report) => report.targetId);
  const proofIds = reports.filter((report) => report.targetType === "PROOF").map((report) => report.targetId);

  const [problems, concepts, posts, proofs, flaggedProblems, controversialConcepts, errorReports, proposedEdits] = await Promise.all([
    prisma.problem.findMany({
      where: { id: { in: problemIds } },
      select: { id: true, slug: true, title: true, status: true, qualityStatus: true }
    }),
    prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, slug: true, title: true, status: true }
    }),
    prisma.discussionPost.findMany({
      where: { id: { in: postIds } },
      include: { author: true, thread: { include: { problem: true } } }
    }),
    prisma.problemProof.findMany({
      where: { id: { in: proofIds } },
      select: {
        id: true,
        bodyMarkdown: true,
        author: true,
        problem: { select: { slug: true, title: true } }
      }
    }),
    prisma.problem.findMany({
      where: { status: "FLAGGED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, updatedAt: true }
    }),
    prisma.concept.findMany({
      where: { status: "CONTROVERSIAL" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, updatedAt: true }
    }),
    prisma.errorReport.findMany({
      where: { reviewedAt: null },
      orderBy: { createdAt: "desc" },
      include: { user: true },
      take: 30
    }),
    canReviewProposedEdits
      ? prisma.problemEditProposal.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          include: { problem: { select: { title: true } }, proposer: true },
          take: 100
        })
      : []
  ]);

  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const postById = new Map(posts.map((post) => [post.id, post]));
  const proofById = new Map(proofs.map((proof) => [proof.id, proof]));

  return (
    <ForestPageLayout
      title="Moderation"
      eyebrow="Careful triage"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      description="Recent reports, light-touch triage, and content hiding when needed."
      meta={
        <>
          <p>{reports.length} reports</p>
          <p>{errorReports.length} site errors</p>
          <p>{conceptMergeProposals.length} concept merge proposals</p>
        </>
      }
    >
      {canSendSiteAnnouncements && (
        <section className="mb-8" id="site-announcements">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Site announcements</h2>
            <Link href={"/moderation/performance" as never} className="button secondary">Performance history</Link>
          </div>
          {queryParams.announcementSent && (
            <p className="panel mb-3 border-accent p-3" role="status">
              Announcement sent to {queryParams.announcementSent} recipient{queryParams.announcementSent === "1" ? "" : "s"}.
            </p>
          )}
          {queryParams.announcementError && (
            <p className="form-error panel mb-3 p-3" role="alert">
              {queryParams.announcementError === "audience"
                ? "Select at least one recipient role."
                : "No active account matches the selected roles."}
            </p>
          )}
          <form action={sendSiteAnnouncementAction} className="panel grid gap-4 p-4">
            <label className="grid gap-1.5 font-medium">
              Title
              <input name="title" required maxLength={160} />
            </label>
            <label className="grid gap-1.5 font-medium">
              Message
              <textarea name="bodyMarkdown" required maxLength={4000} rows={6} />
            </label>
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium">Recipients</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2">
                  <input name="audienceRoles" type="checkbox" value={Role.USER} />
                  Members
                </label>
                <label className="inline-flex items-center gap-2">
                  <input name="audienceRoles" type="checkbox" value={Role.MODERATOR} />
                  Trusted users
                </label>
                <label className="inline-flex items-center gap-2">
                  <input name="audienceRoles" type="checkbox" value={Role.ADMIN} />
                  Admins
                </label>
                <label className="inline-flex items-center gap-2">
                  <input name="audienceRoles" type="checkbox" value={Role.OWNER} defaultChecked />
                  Owner
                </label>
              </div>
            </fieldset>
            <button type="submit" className="justify-self-start">Send announcement</button>
          </form>

          <div className="mt-4 grid gap-2">
            {recentAnnouncements.map((announcement) => {
              const acknowledged = acknowledgedByAnnouncement.get(announcement.id) ?? 0;
              return (
                <article key={announcement.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{announcement.title}</p>
                    <p className="muted text-sm">
                      {announcement.audienceRoles.map((role) => role === Role.MODERATOR ? "trusted" : role.toLowerCase()).join(", ")}
                      {" · "}{acknowledged}/{announcement._count.recipients} acknowledged
                      {" · "}{formatUserDateTime(announcement.createdAt, timeZone)}
                      {announcement.cancelledAt ? " · cancelled" : ""}
                    </p>
                  </div>
                  {!announcement.cancelledAt && acknowledged < announcement._count.recipients && (
                    <form action={cancelSiteAnnouncementAction.bind(null, announcement.id)}>
                      <button type="submit" className="secondary">Cancel</button>
                    </form>
                  )}
                </article>
              );
            })}
            {recentAnnouncements.length === 0 && <p className="muted text-sm">No announcements sent yet.</p>}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Concept merges and translation links</h2>
        <div className="grid gap-3">
          {conceptMergeProposals.map((proposal) => (
            <article key={proposal.id} className="panel flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">
                  <AsyncMarkdownInline markdown={proposal.sourceTitle} />
                  {" → "}
                  <AsyncMarkdownInline markdown={proposal.targetTitle} />
                </p>
                <p className="muted text-sm">
                  {proposal.kind === "DUPLICATE" ? "same-language duplicate" : "translation link"}
                  {" · proposed by "}<UserName user={proposal.proposedBy} />
                  {" · "}{formatUserDateTime(proposal.createdAt, timeZone)}
                </p>
              </div>
              <Link href={`/moderation/concept-merges/${proposal.id}` as never} className="button secondary">
                Review
              </Link>
            </article>
          ))}
          {conceptMergeProposals.length === 0 && <p className="muted panel p-5">No pending concept merges.</p>}
        </div>
      </section>

      {canReviewProposedEdits && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">Proposed problem edits</h2>
          <div className="grid gap-3">
            {proposedEdits.map((proposal) => (
              <div key={proposal.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/moderation/problem-edits/${proposal.id}` as never} className="font-medium underline">
                    <AsyncMarkdownInline markdown={proposal.problem.title} />
                  </Link>
                  <p className="muted text-sm">
                    proposed by <UserName user={proposal.proposer} /> - {formatUserDateTime(proposal.createdAt, timeZone)}
                  </p>
                  {proposal.editSummary && <p className="mt-1 text-sm">{proposal.editSummary}</p>}
                </div>
                <Link href={`/moderation/problem-edits/${proposal.id}` as never} className="button">
                  Review changes
                </Link>
              </div>
            ))}
            {proposedEdits.length === 0 && <p className="muted panel p-5">No proposed problem edits.</p>}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Site errors</h2>
        <div className="grid gap-3">
          {errorReports.map((errorReport) => (
            <section key={errorReport.id} id={`error-report-${errorReport.id}`} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    {errorReport.source} / {formatUserDateTime(errorReport.createdAt, timeZone)}
                  </div>
                  <p className="muted text-sm">
                    {errorReport.user ? <>reported while signed in as <UserName user={errorReport.user} /></> : "anonymous user"}
                  </p>
                </div>
                <Link href={errorReport.path as never} className="underline">
                  {errorReport.path}
                </Link>
              </div>

              <p className="mt-3 font-medium">{errorReport.message}</p>
              {errorReport.digest && <p className="muted mt-2 text-sm">Digest: {errorReport.digest}</p>}
              {errorReport.userAgent && <p className="muted mt-2 text-sm">Browser: {errorReport.userAgent}</p>}
              {errorReport.stack && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold">Stack trace</summary>
                  <pre className="mt-2 overflow-auto rounded border border-line bg-code p-3 text-xs">{errorReport.stack}</pre>
                </details>
              )}

              <form action={markErrorReportReviewedAction.bind(null, errorReport.id)} className="mt-4">
                <button type="submit" className="secondary">
                  Mark reviewed
                </button>
              </form>
            </section>
          ))}
          {errorReports.length === 0 && <p className="muted panel p-5">No unreviewed site errors.</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Flagged problems</h2>
        <div className="grid gap-3">
          {flaggedProblems.map((problem) => (
            <div key={problem.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/problems/${problem.slug}`} className="font-medium underline">
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
                <p className="muted text-sm">updated {formatUserDateTime(problem.updatedAt, timeZone)}</p>
              </div>
              <form action={publishProblemAction.bind(null, problem.id)}>
                <button type="submit" className="secondary">
                  Publish again
                </button>
              </form>
            </div>
          ))}
          {flaggedProblems.length === 0 && <p className="muted panel p-5">No flagged problems.</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Controversial concepts</h2>
        <div className="grid gap-3">
          {controversialConcepts.map((concept) => (
            <div key={concept.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/concepts/${concept.slug}`} className="font-medium underline">
                  <AsyncMarkdownInline markdown={concept.title} />
                </Link>
                <p className="muted text-sm">updated {formatUserDateTime(concept.updatedAt, timeZone)}</p>
              </div>
              <form action={markConceptUsableAction.bind(null, concept.id)}>
                <button type="submit" className="secondary">
                  Mark usable
                </button>
              </form>
            </div>
          ))}
          {controversialConcepts.length === 0 && <p className="muted panel p-5">No controversial concepts.</p>}
        </div>
      </section>

      <h2 className="mb-3 font-semibold">Reports</h2>
      <div className="grid gap-3">
        {reports.map((report) => {
          const problem = problemById.get(report.targetId);
          const concept = conceptById.get(report.targetId);
          const post = postById.get(report.targetId);
          const proof = proofById.get(report.targetId);

          return (
            <section key={report.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    {report.targetType.toLowerCase()} · {report.status.toLowerCase()}
                  </div>
                  <p className="muted text-sm">
                    reported by <UserName user={report.reporter} /> · {formatUserDateTime(report.createdAt, timeZone)}
                  </p>
                </div>
                {report.targetType === "PROBLEM" && problem && (
                  <div className="text-right">
                    <Link href={`/problems/${problem.slug}`} className="underline">
                      <AsyncMarkdownInline markdown={problem.title} />
                    </Link>
                    <p className="muted text-sm">{qualityLabel(problem.qualityStatus)}</p>
                  </div>
                )}
                {report.targetType === "CONCEPT" && concept && (
                  <Link href={`/concepts/${concept.slug}`} className="underline">
                    <AsyncMarkdownInline markdown={concept.title} />
                  </Link>
                )}
                {report.targetType === "POST" && post && (
                  <Link href={`/problems/${post.thread.problem.slug}`} className="underline">
                    Post on <AsyncMarkdownInline markdown={post.thread.problem.title} />
                  </Link>
                )}
                {report.targetType === "PROOF" && proof && (
                  <Link href={`/problems/${proof.problem.slug}#solution-${proof.id}`} className="underline">
                    Solution on <AsyncMarkdownInline markdown={proof.problem.title} />
                  </Link>
                )}
              </div>

              {report.category && (
                <p className="eyebrow mt-3">{report.category.toLowerCase().replaceAll("_", " ")}</p>
              )}
              <p className="mt-3">{report.reason}</p>
              {post && (
                <blockquote className="mt-3 border-l-2 border-line pl-3 text-sm">
                  <div className="muted mb-1">
                    {post.deletedAt ? "Hidden post" : "Visible post"} by <UserName user={post.author} />
                  </div>
                  {post.bodyMarkdown}
                </blockquote>
              )}
              {proof && (
                <blockquote className="mt-3 border-l-2 border-line pl-3 text-sm">
                  <div className="muted mb-1">
                    Solution by <UserName user={proof.author} />
                  </div>
                  {proof.bodyMarkdown.slice(0, 700)}
                  {proof.bodyMarkdown.length > 700 ? "..." : ""}
                </blockquote>
              )}

              {report.status === "OPEN" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {report.targetType === "PROBLEM" && problem && (
                    <>
                      <form action={markReportedProblemNeedsWorkAction.bind(null, report.id, problem.id)}>
                        <button type="submit" className="secondary">
                          Mark needs work
                        </button>
                      </form>
                      <form action={hideReportedProblemAction.bind(null, report.id, problem.id)}>
                        <button type="submit">Hide problem</button>
                      </form>
                    </>
                  )}
                  {report.targetType === "CONCEPT" && concept && (
                    <form action={markReportedConceptControversialAction.bind(null, report.id, concept.id)}>
                      <button type="submit">Mark controversial</button>
                    </form>
                  )}
                  {report.targetType === "POST" && post && !post.deletedAt && (
                    <form action={hideReportedPostAction.bind(null, report.id, post.id)}>
                      <button type="submit">Hide post</button>
                    </form>
                  )}
                  {report.targetType === "PROOF" && proof && (
                    <form action={resolveReportedProofAction.bind(null, report.id, proof.id)}>
                      <button type="submit">Mark addressed</button>
                    </form>
                  )}
                  <form action={dismissReportAction.bind(null, report.id)}>
                    <button type="submit" className="secondary">
                      Dismiss
                    </button>
                  </form>
                </div>
              )}
            </section>
          );
        })}

        {reports.length === 0 && <p className="muted panel p-5">No reports.</p>}
      </div>
    </ForestPageLayout>
  );
}
