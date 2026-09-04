import { LibraryStatus } from "@prisma/client";
import { libraryCopy } from "@/lib/library-copy";

export function LibraryReviewNote({
  status,
  note,
  locale
}: {
  status: LibraryStatus;
  note: string | null;
  locale: "en" | "fr";
}) {
  if ((status !== LibraryStatus.NEEDS_WORK && status !== LibraryStatus.DRAFT) || !note) return null;
  return (
    <aside className="library-review-note">
      <strong>{libraryCopy[locale].requestedChanges}</strong>
      <p>{note}</p>
    </aside>
  );
}
