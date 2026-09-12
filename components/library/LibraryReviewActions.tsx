import { LibraryStatus } from "@prisma/client";
import { FieldHelp } from "@/components/FieldHelp";
import { reviewLibraryEntryAction } from "@/lib/actions/library-actions";
import { libraryCopy } from "@/lib/library-copy";

export function LibraryReviewActions({
  entity,
  id,
  locale,
  status,
  canReview,
  canArchive,
  compact = false,
  needsReviewAfterEdit = false,
  baseUpdatedAt
}: {
  entity: "mathematician" | "reference" | "milestone";
  id: number;
  locale: "en" | "fr";
  status: LibraryStatus;
  canReview: boolean;
  canArchive: boolean;
  compact?: boolean;
  needsReviewAfterEdit?: boolean;
  baseUpdatedAt?: string;
}) {
  const copy = libraryCopy[locale];
  const awaitingReview = status === LibraryStatus.PENDING_REVIEW || (status === LibraryStatus.PUBLISHED && needsReviewAfterEdit);
  if (!canArchive && !(canReview && awaitingReview)) return null;

  const versionField = baseUpdatedAt ? <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} /> : null;
  const feedbackForm = <form action={reviewLibraryEntryAction.bind(null, entity, id, "changes")} className="library-review-feedback-form">
    {versionField}
    <label><span>{copy.reviewNote}</span><textarea name="reviewNote" required rows={3} placeholder={copy.reviewNotePlaceholder} /></label>
    <button className="secondary">{copy.requestChanges}</button>
  </form>;
  return (
    <details className="library-management">
      <summary>{locale === "fr" ? "Gestion de la fiche" : "Manage this entry"}</summary>
      {entity === "mathematician" && !canReview && awaitingReview && <div className="library-management-help">
        <span>{locale === "fr" ? "Relecture" : "Review"}</span>
        <FieldHelp text={locale === "fr" ? "La relecture doit être effectuée par une autre personne que l’auteur ou le dernier contributeur." : "The reviewer must be someone other than the author or last editor."} />
      </div>}
      <div className="library-review-actions">
      {canReview && awaitingReview && (
        <>
          <form action={reviewLibraryEntryAction.bind(null, entity, id, "publish")}>{versionField}<input type="hidden" name="language" value={locale} /><button className="primary">{status === LibraryStatus.PUBLISHED ? (locale === "fr" ? "Confirmer la relecture" : "Confirm review") : copy.publish}</button></form>
          {status === LibraryStatus.PENDING_REVIEW && (compact ? <details className="library-review-feedback"><summary>{copy.requestChanges}</summary>{feedbackForm}</details> : feedbackForm)}
        </>
      )}
      {canArchive && status !== LibraryStatus.ARCHIVED && (
        <form action={reviewLibraryEntryAction.bind(null, entity, id, "archive")}>{versionField}<button className="danger">{copy.archive}</button></form>
      )}
      {canArchive && status === LibraryStatus.ARCHIVED && (
        <form action={reviewLibraryEntryAction.bind(null, entity, id, "restore")}>{versionField}<button className="secondary">{copy.restore}</button></form>
      )}
      </div>
    </details>
  );
}
