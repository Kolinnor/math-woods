import Link from "next/link";
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

  const [problems, concepts, posts, flaggedProblems, controversialConcepts] = await Promise.all([
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
                    reported by @{report.reporter.username} · {report.createdAt.toLocaleString("en-US")}
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
                    {post.deletedAt ? "Hidden post" : "Visible post"} by @{post.author.username}
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
