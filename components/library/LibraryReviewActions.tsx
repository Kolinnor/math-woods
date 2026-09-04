import { LibraryStatus } from "@prisma/client";
import { reviewLibraryEntryAction } from "@/lib/actions/library-actions";
import { libraryCopy } from "@/lib/library-copy";

export function LibraryReviewActions({
  entity,
  id,
  locale,
  status,
  canReview,
  canArchive
}: {
  entity: "mathematician" | "reference" | "milestone";
  id: number;
  locale: "en" | "fr";
  status: LibraryStatus;
  canReview: boolean;
  canArchive: boolean;
}) {
  const copy = libraryCopy[locale];
  return (
    <div className="library-review-actions">
      {canReview && status === LibraryStatus.PENDING_REVIEW && (
        <>
          <form action={reviewLibraryEntryAction.bind(null, entity, id, "publish")}><button className="primary">{copy.publish}</button></form>
          <form action={reviewLibraryEntryAction.bind(null, entity, id, "changes")} className="library-review-feedback-form">
            <label>
              <span>{copy.reviewNote}</span>
              <textarea name="reviewNote" required rows={3} placeholder={copy.reviewNotePlaceholder} />
            </label>
            <button className="secondary">{copy.requestChanges}</button>
          </form>
        </>
      )}
      {canArchive && status !== LibraryStatus.ARCHIVED && (
        <form action={reviewLibraryEntryAction.bind(null, entity, id, "archive")}><button className="danger">{copy.archive}</button></form>
      )}
      {canArchive && status === LibraryStatus.ARCHIVED && (
        <form action={reviewLibraryEntryAction.bind(null, entity, id, "restore")}><button className="secondary">{copy.restore}</button></form>
      )}
    </div>
  );
}
