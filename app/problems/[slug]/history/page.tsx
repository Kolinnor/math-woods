import Link from "next/link";
import { notFound } from "next/navigation";
import { rollbackProblemRevisionAction } from "@/lib/actions/problem-actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProblemHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({ where: { slug } });

  if (!problem) notFound();

  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: "PROBLEM", pageId: problem.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Problem history</h1>
          <p className="muted mt-1">{problem.title}</p>
        </div>
        <Link href={`/problems/${problem.slug}`} className="button secondary">
          Back
        </Link>
      </div>

      <div className="grid gap-3">
        {revisions.map((revision) => (
          <section key={revision.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Revision {revision.id}</h2>
                <p className="muted text-sm">
                  {revision.createdAt.toLocaleString("en-US")}
                  {revision.editedById ? ` · user #${revision.editedById}` : ""}
                </p>
              </div>
              <form action={rollbackProblemRevisionAction.bind(null, problem.id, revision.id)}>
                <button type="submit" className="secondary">
                  Roll back
                </button>
              </form>
            </div>
            {revision.editSummary && <p className="mt-3">{revision.editSummary}</p>}
            <pre className="mt-3 max-h-48 overflow-auto rounded bg-[#f1ede3] p-3 text-xs">{revision.markdown}</pre>
          </section>
        ))}
      </div>
    </div>
  );
}
