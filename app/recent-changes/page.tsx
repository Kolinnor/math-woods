import type { Route } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function RecentChangesPage() {
  const revisions = await prisma.pageRevision.findMany({
    include: { editedBy: true },
    orderBy: { createdAt: "desc" },
    take: 75
  });
  const conceptIds = revisions.filter((item) => item.pageType === "CONCEPT").map((item) => item.pageId);
  const problemIds = revisions.filter((item) => item.pageType === "PROBLEM").map((item) => item.pageId);
  const [concepts, problems] = await Promise.all([
    prisma.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, slug: true, title: true } }),
    prisma.problem.findMany({ where: { id: { in: problemIds } }, select: { id: true, slug: true, title: true } })
  ]);
  const conceptsById = new Map(concepts.map((item) => [item.id, item]));
  const problemsById = new Map(problems.map((item) => [item.id, item]));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Recent changes</h1>
        <p className="muted mt-1">A transparent log of recent article and problem edits.</p>
      </div>

      <div className="grid gap-2">
        {revisions.map((revision) => {
          const page =
            revision.pageType === "CONCEPT" ? conceptsById.get(revision.pageId) : problemsById.get(revision.pageId);
          if (!page) return null;
          const href =
            (revision.pageType === "CONCEPT" ? `/concepts/${page.slug}` : `/problems/${page.slug}`) as Route;

          return (
            <article key={revision.id} className="border-b border-line py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="muted mr-2 text-xs uppercase">{revision.pageType.toLowerCase()}</span>
                  <Link href={href} className="font-medium underline">
                    {page.title}
                  </Link>
                </div>
                <span className="muted text-xs">{revision.createdAt.toLocaleString("en-US")}</span>
              </div>
              <p className="mt-1 text-sm">{revision.editSummary || "No edit summary."}</p>
              <p className="muted mt-1 text-xs">
                {revision.editedBy ? displayNameForUser(revision.editedBy) : "unknown"}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
