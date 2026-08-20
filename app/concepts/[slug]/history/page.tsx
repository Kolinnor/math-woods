import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { RevisionDiff } from "@/components/RevisionDiff";
import { UserName } from "@/components/UserName";
import { rollbackConceptRevisionAction } from "@/lib/actions/concept-actions";
import { getCurrentUser } from "@/lib/auth";
import {
  changedConceptSnapshotFields,
  parseConceptRevisionSnapshot,
  type ConceptRevisionSnapshot,
  type ConceptSnapshotField
} from "@/lib/concept-revisions";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { contentLanguageNativeLabel } from "@/lib/languages";

export const dynamic = "force-dynamic";

function joinedOrNone(values: string[], none: string) {
  return values.length ? values.join(", ") : none;
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
      return contentLanguageNativeLabel(snapshot.language);
    case "domainCode":
      return translatedDomainLabel(snapshot.domainCode, t.home.domainLabels);
    case "kind":
      return t.concepts.kinds[snapshot.kind];
    case "status":
      return t.concepts.statuses[snapshot.status] ?? snapshot.status.toLowerCase();
    case "needsReviewAfterEdit":
      return snapshot.needsReviewAfterEdit ? t.historyPage.reviewNeeded : t.historyPage.upToDate;
    case "canAppearInConceptBrowser":
      return snapshot.canAppearInConceptBrowser ? t.historyPage.listed : t.historyPage.hidden;
    case "translatedFromRevisionId":
      return snapshot.translatedFromRevisionId ? t.historyPage.sourceRevision(snapshot.translatedFromRevisionId) : t.historyPage.noSourceRevision;
    case "aliases":
      return joinedOrNone(snapshot.aliases.map((alias) => alias.alias), t.historyPage.none);
    case "references":
      return joinedOrNone(
        snapshot.references.map((reference) =>
          [reference.title, reference.url, reference.note].filter(Boolean).join(" | ")
        ),
        t.historyPage.none
      );
    case "practiceExercises":
      return joinedOrNone(snapshot.practiceExercises.map((exercise) => exercise.title), t.historyPage.none);
  }
}

export default async function ConceptHistoryPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ mergedSource?: string }>;
}) {
  const [user, t, interfaceLocale] = await Promise.all([getCurrentUser(), getTranslations(), getInterfaceLocale()]);
  const { slug } = await params;
  const concept = await prisma.concept.findUnique({ where: { slug } });

  if (!concept) {
    const [alias, merged] = await Promise.all([
      prisma.conceptAlias.findUnique({ where: { aliasSlug: slug }, include: { concept: true } }),
      prisma.conceptRedirect.findUnique({ where: { sourceSlug: slug }, include: { targetConcept: true } })
    ]);
    if (merged) redirect(`/concepts/${merged.targetConcept.slug}/history?mergedSource=${merged.sourceConceptId}`);
    if (alias) redirect(`/concepts/${alias.concept.slug}/history`);
    notFound();
  }

  const mergedSources = await prisma.conceptRedirect.findMany({
    where: { targetConceptId: concept.id },
    orderBy: { createdAt: "desc" }
  });
  const requestedMergedSource = Number((await searchParams)?.mergedSource);
  const selectedMergedSource = Number.isInteger(requestedMergedSource)
    ? mergedSources.find(({ sourceConceptId }) => sourceConceptId === requestedMergedSource)
    : null;
  const revisionPageId = selectedMergedSource?.sourceConceptId ?? concept.id;

  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: "CONCEPT", pageId: revisionPageId },
    include: { editedBy: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <ForestPageLayout
      title={t.historyPage.conceptTitle}
      eyebrow={<AsyncMarkdownInline markdown={selectedMergedSource?.sourceTitle ?? concept.title} />}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={t.historyPage.conceptDescription}
      workspaceClassName="forest-page-workspace-narrow"
      meta={<p>{t.historyPage.revisions(revisions.length)}</p>}
      actions={
        <Link href={`/concepts/${concept.slug}`} className="button secondary">
          {t.historyPage.back}
        </Link>
      }
    >
      {mergedSources.length > 0 && (
        <nav className="panel mb-5 flex flex-wrap gap-2 p-3 text-sm" aria-label="Merged concept histories">
          <Link href={`/concepts/${concept.slug}/history`} className="button secondary">
            <AsyncMarkdownInline markdown={concept.title} />
          </Link>
          {mergedSources.map((source) => (
            <Link
              key={source.id}
              href={`/concepts/${concept.slug}/history?mergedSource=${source.sourceConceptId}` as never}
              className="button secondary"
            >
              <AsyncMarkdownInline markdown={source.sourceTitle} />
            </Link>
          ))}
        </nav>
      )}
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
                <h2 className="font-semibold">{t.historyPage.revision(revision.id)}</h2>
                <p className="muted text-sm">
                  {revision.createdAt.toLocaleString(interfaceLocale)}
                  {revision.editedBy && (
                    <>
                      {" · "}
                      <UserName user={revision.editedBy} />
                    </>
                  )}
                </p>
              </div>
              {user && !selectedMergedSource && (
                <form action={rollbackConceptRevisionAction.bind(null, concept.id, revision.id)}>
                  <button type="submit" className="secondary">
                    {t.historyPage.rollback}
                  </button>
                </form>
              )}
            </div>
            <p className="mt-3">{revision.editSummary || t.historyPage.noSummary}</p>
            {!snapshot && revision.conceptTitle && revision.conceptTitle !== previousRevision?.conceptTitle && (
              <div className="revision-field-diff mt-3">
                <strong>{previousRevision?.conceptTitle ? t.historyPage.titleChanged : t.historyPage.recordedTitle}</strong>
                {previousRevision?.conceptTitle && <del><AsyncMarkdownInline markdown={previousRevision.conceptTitle} /></del>}
                {previousRevision?.conceptTitle && <span aria-hidden="true">→</span>}
                <ins><AsyncMarkdownInline markdown={revision.conceptTitle} /></ins>
              </div>
            )}
            {!snapshot && revision.conceptKind && revision.conceptKind !== previousRevision?.conceptKind && (
              <div className="revision-field-diff mt-3">
                <strong>{previousRevision?.conceptKind ? t.historyPage.typeChanged : t.historyPage.recordedType}</strong>
                {previousRevision?.conceptKind && <del>{t.concepts.kinds[previousRevision.conceptKind]}</del>}
                {previousRevision?.conceptKind && <span aria-hidden="true">→</span>}
                <ins>{t.concepts.kinds[revision.conceptKind]}</ins>
              </div>
            )}
            {snapshot && previousSnapshot && metadataChanges.map((field) => (
              <div className="revision-field-diff mt-3" key={field}>
                <strong>{t.historyPage.fields[field]}</strong>
                <del>
                  {field === "title" || field === "practiceExercises"
                    ? <AsyncMarkdownInline markdown={conceptSnapshotValue(previousSnapshot, field, t)} />
                    : conceptSnapshotValue(previousSnapshot, field, t)}
                </del>
                <span aria-hidden="true">{t.historyPage.changedTo}</span>
                <ins>
                  {field === "title" || field === "practiceExercises"
                    ? <AsyncMarkdownInline markdown={conceptSnapshotValue(snapshot, field, t)} />
                    : conceptSnapshotValue(snapshot, field, t)}
                </ins>
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
                  labels={t.historyPage}
                />
              ) : metadataChanges.length === 0 ? (
                <p className="muted mt-3 text-sm">
                  {snapshot && previousSnapshot
                    ? t.historyPage.noRecordedChanges
                    : t.historyPage.predatesTracking}
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
