import type { LibraryStatus } from "@prisma/client";
import { libraryStatusLabel } from "@/lib/library";

export function LibraryStatusBadge({ status, locale, reviewed }: { status: LibraryStatus; locale: "en" | "fr"; reviewed?: boolean }) {
  if (status === "PUBLISHED" && reviewed !== undefined) {
    return <span className={`library-status library-status-${reviewed ? "published" : "pending_review"}`}>{locale === "fr" ? (reviewed ? "Relu" : "Non relu") : (reviewed ? "Reviewed" : "Not reviewed")}</span>;
  }
  return <span className={`library-status library-status-${status.toLowerCase()}`}>{libraryStatusLabel(status, locale)}</span>;
}
