import Link from "next/link";
import { markErrorReportReviewedAction } from "@/lib/actions/error-report-actions";
import {
  dismissReportAction,
  hideReportedPostAction,
  hideReportedProblemAction,
  markConceptUsableAction,
  markReportedProblemNeedsWorkAction,
  markReportedConceptControversialAction,
  publishProblemAction
} from "@/lib/actions/moderation-actions";
import { requireModerator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { qualityLabel } from "@/lib/quality";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  await requireModerator();

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: { reporter: true },
    take: 100
  });

  const problemIds = reports.filter((report) => report.targetType === "PROBLEM").map((report) => report.targetId);
  const conceptIds = reports.filter((report) => report.targetType === "CONCEPT").map((report) => report.targetId);
  const postIds = reports.filter((report) => report.targetType === "POST").map((report) => report.targetId);

  const [problems, concepts, posts, flaggedProblems, controversialConcepts, errorReports] = await Promise.all([
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
    })
  ]);

  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const postById = new Map(posts.map((post) => [post.id, post]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="muted mt-1">Recent reports, light-touch triage, and content hiding when needed.</p>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Site errors</h2>
        <div className="grid gap-3">
          {errorReports.map((errorReport) => (
            <section key={errorReport.id} id={`error-report-${errorReport.id}`} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    {errorReport.source} / {errorReport.createdAt.toLocaleString("en-US")}
                  </div>
                  <p className="muted text-sm">
                    {errorReport.user ? `reported while signed in as ${displayNameForUser(errorReport.user)}` : "anonymous user"}
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
                  {problem.title}
                </Link>
                <p className="muted text-sm">updated {problem.updatedAt.toLocaleString("en-US")}</p>
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
                  {concept.title}
                </Link>
                <p className="muted text-sm">updated {concept.updatedAt.toLocaleString("en-US")}</p>
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

          return (
            <section key={report.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    {report.targetType.toLowerCase()} · {report.status.toLowerCase()}
                  </div>
                  <p className="muted text-sm">
                    reported by {displayNameForUser(report.reporter)} · {report.createdAt.toLocaleString("en-US")}
                  </p>
                </div>
                {report.targetType === "PROBLEM" && problem && (
                  <div className="text-right">
                    <Link href={`/problems/${problem.slug}`} className="underline">
                      {problem.title}
                    </Link>
                    <p className="muted text-sm">{qualityLabel(problem.qualityStatus)}</p>
                  </div>
                )}
                {report.targetType === "CONCEPT" && concept && (
                  <Link href={`/concepts/${concept.slug}`} className="underline">
                    {concept.title}
                  </Link>
                )}
                {report.targetType === "POST" && post && (
                  <Link href={`/problems/${post.thread.problem.slug}`} className="underline">
                    Post on {post.thread.problem.title}
                  </Link>
                )}
              </div>

              <p className="mt-3">{report.reason}</p>
              {post && (
                <blockquote className="mt-3 border-l-2 border-line pl-3 text-sm">
                  <div className="muted mb-1">
                    {post.deletedAt ? "Hidden post" : "Visible post"} by {displayNameForUser(post.author)}
                  </div>
                  {post.bodyMarkdown}
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
    </div>
  );
}
