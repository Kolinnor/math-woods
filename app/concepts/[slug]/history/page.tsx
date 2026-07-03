import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { rollbackConceptRevisionAction } from "@/lib/actions/concept-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ConceptHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  const { slug } = await params;
  const concept = await prisma.concept.findUnique({ where: { slug } });

  if (!concept) notFound();

  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: "CONCEPT", pageId: concept.id },
    include: { editedBy: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <ForestPageLayout
      title="Concept history"
      eyebrow={concept.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description="A revision trail for this concept page."
      workspaceClassName="forest-page-workspace-narrow"
      meta={<p>{revisions.length} revisions</p>}
      actions={
        <Link href={`/concepts/${concept.slug}`} className="button secondary">
          Back
        </Link>
      }
    >
      <div className="grid gap-3">
        {revisions.map((revision) => (
          <section key={revision.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Revision {revision.id}</h2>
                <p className="muted text-sm">
                  {revision.createdAt.toLocaleString("en-US")}
                  {revision.editedBy ? ` · ${displayNameForUser(revision.editedBy)}` : ""}
                </p>
              </div>
              {user && (
                <form action={rollbackConceptRevisionAction.bind(null, concept.id, revision.id)}>
                  <button type="submit" className="secondary">
                    Roll back
                  </button>
                </form>
              )}
            </div>
            <p className="mt-3">{revision.editSummary || "No edit summary."}</p>
            <pre className="revision-preview mt-3 max-h-48 overflow-auto rounded p-3 text-xs">{revision.markdown}</pre>
          </section>
        ))}
      </div>
    </ForestPageLayout>
  );
}
