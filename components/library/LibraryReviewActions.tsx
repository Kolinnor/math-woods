import { LibraryStatus } from "@prisma/client";
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
  const versionField = baseUpdatedAt ? <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} /> : null;
  const feedbackForm = <form action={reviewLibraryEntryAction.bind(null, entity, id, "changes")} className="library-review-feedback-form">
    {versionField}
    <label><span>{copy.reviewNote}</span><textarea name="reviewNote" required rows={3} placeholder={copy.reviewNotePlaceholder} /></label>
    <button className="secondary">{copy.requestChanges}</button>
  </form>;
  return (
    <div className="library-review-actions">
      {canReview && (status === LibraryStatus.PENDING_REVIEW || (status === LibraryStatus.PUBLISHED && needsReviewAfterEdit)) && (
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
  );
}
