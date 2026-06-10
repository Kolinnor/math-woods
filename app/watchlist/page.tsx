import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const user = await requireUser();
  const watched = await prisma.conceptWatch.findMany({
    where: { userId: user.id },
    include: { concept: true },
    orderBy: { createdAt: "desc" }
  });
  const conceptIds = watched.map((item) => item.conceptId);
  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: "CONCEPT", pageId: { in: conceptIds } },
    include: { editedBy: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  const conceptsById = new Map(watched.map((item) => [item.conceptId, item.concept]));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="muted mt-1">Recent edits to concepts you follow.</p>
      </div>

      <div className="grid gap-3">
        {revisions.map((revision) => {
          const concept = conceptsById.get(revision.pageId);
          if (!concept) return null;
          return (
            <article key={revision.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={`/concepts/${concept.slug}`} className="font-semibold underline">
                  {concept.title}
                </Link>
                <span className="muted text-sm">{revision.createdAt.toLocaleString("en-US")}</span>
              </div>
              <p className="mt-2 text-sm">{revision.editSummary || "No edit summary."}</p>
              <p className="muted mt-1 text-xs">edited by @{revision.editedBy?.username ?? "unknown"}</p>
            </article>
          );
        })}
        {revisions.length === 0 && (
          <p className="muted panel p-5">Watch a concept to see its future edits here.</p>
        )}
      </div>
    </div>
  );
}
