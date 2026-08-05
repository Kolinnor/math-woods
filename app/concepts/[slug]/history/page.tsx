import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { RevisionDiff } from "@/components/RevisionDiff";
import { UserName } from "@/components/UserName";
import { rollbackConceptRevisionAction } from "@/lib/actions/concept-actions";
import { getCurrentUser } from "@/lib/auth";
import {
  changedConceptSnapshotFields,
  CONCEPT_SNAPSHOT_FIELD_LABELS,
  parseConceptRevisionSnapshot,
  type ConceptRevisionSnapshot,
  type ConceptSnapshotField
} from "@/lib/concept-revisions";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { contentLanguageLabel } from "@/lib/languages";

export const dynamic = "force-dynamic";

function joinedOrNone(values: string[]) {
  return values.length ? values.join(", ") : "None";
}

function conceptSnapshotValue(
  snapshot: ConceptRevisionSnapshot,
  field: Exclude<ConceptSnapshotField, "bodyMarkdown">,
  t: Dictionary
) {
  switch (field) {
    case "title":
      return snapshot.title;
    case "language":
      return contentLanguageLabel(snapshot.language);
    case "domainCode":
      return translatedDomainLabel(snapshot.domainCode, t.home.domainLabels);
    case "kind":
      return t.concepts.kinds[snapshot.kind];
    case "status":
      return t.concepts.statuses[snapshot.status] ?? snapshot.status.toLowerCase();
    case "needsReviewAfterEdit":
      return snapshot.needsReviewAfterEdit ? "Review needed after an edit" : "Up to date";
    case "canAppearInConceptBrowser":
      return snapshot.canAppearInConceptBrowser ? "Listed in the concept browser" : "Hidden from the concept browser";
    case "translatedFromRevisionId":
      return snapshot.translatedFromRevisionId ? `Source revision ${snapshot.translatedFromRevisionId}` : "Not linked to a source revision";
    case "aliases":
      return joinedOrNone(snapshot.aliases.map((alias) => alias.alias));
    case "references":
      return joinedOrNone(
        snapshot.references.map((reference) =>
          [reference.title, reference.url, reference.note].filter(Boolean).join(" | ")
        )
      );
    case "practiceExercises":
      return joinedOrNone(snapshot.practiceExercises.map((exercise) => exercise.title));
  }
}

export default async function ConceptHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations()]);
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
        {revisions.map((revision, index) => {
          const previousRevision = revisions[index + 1];
          const snapshot = parseConceptRevisionSnapshot(revision.conceptSnapshot);
          const previousSnapshot = parseConceptRevisionSnapshot(previousRevision?.conceptSnapshot ?? null);
          const metadataChanges = snapshot && previousSnapshot
            ? changedConceptSnapshotFields(previousSnapshot, snapshot).filter(
                (field): field is Exclude<ConceptSnapshotField, "bodyMarkdown"> => field !== "bodyMarkdown"
              )
            : [];
          const textChanged = Boolean(previousRevision && revision.markdown !== previousRevision.markdown);

          return (
            <section key={revision.id} id={`revision-${revision.id}`} className="revision-card panel p-4 scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Revision {revision.id}</h2>
                <p className="muted text-sm">
                  {revision.createdAt.toLocaleString("en-US")}
                  {revision.editedBy && (
                    <>
                      {" · "}
                      <UserName user={revision.editedBy} />
                    </>
                  )}
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
            {!snapshot && revision.conceptTitle && revision.conceptTitle !== previousRevision?.conceptTitle && (
              <div className="revision-field-diff mt-3">
                <strong>{previousRevision?.conceptTitle ? "Title changed" : "Recorded title"}</strong>
                {previousRevision?.conceptTitle && <del>{previousRevision.conceptTitle}</del>}
                {previousRevision?.conceptTitle && <span aria-hidden="true">→</span>}
                <ins>{revision.conceptTitle}</ins>
              </div>
            )}
            {!snapshot && revision.conceptKind && revision.conceptKind !== previousRevision?.conceptKind && (
              <div className="revision-field-diff mt-3">
                <strong>{previousRevision?.conceptKind ? "Type changed" : "Recorded type"}</strong>
                {previousRevision?.conceptKind && <del>{t.concepts.kinds[previousRevision.conceptKind]}</del>}
                {previousRevision?.conceptKind && <span aria-hidden="true">→</span>}
                <ins>{t.concepts.kinds[revision.conceptKind]}</ins>
              </div>
            )}
            {snapshot && previousSnapshot && metadataChanges.map((field) => (
              <div className="revision-field-diff mt-3" key={field}>
                <strong>{CONCEPT_SNAPSHOT_FIELD_LABELS[field]}</strong>
                <del>{conceptSnapshotValue(previousSnapshot, field, t)}</del>
                <span aria-hidden="true">to</span>
                <ins>{conceptSnapshotValue(snapshot, field, t)}</ins>
              </div>
            ))}
            {previousRevision ? (
              textChanged ? (
                <RevisionDiff
                  afterMarkdown={revision.markdown}
                  beforeMarkdown={previousRevision.markdown}
                  beforeRevisionId={previousRevision.id}
                  defaultOpen={index === 0}
                  revisionId={revision.id}
                />
              ) : metadataChanges.length === 0 ? (
                <p className="muted mt-3 text-sm">
                  {snapshot && previousSnapshot
                    ? "No content or metadata changes were recorded."
                    : "This older revision predates detailed metadata tracking."}
                </p>
              ) : null
            ) : (
              <pre className="revision-preview mt-3 max-h-48 overflow-auto rounded p-3 text-xs">{revision.markdown}</pre>
            )}
            </section>
          );
        })}
      </div>
    </ForestPageLayout>
  );
}
