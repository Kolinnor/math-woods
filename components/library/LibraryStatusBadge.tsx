import type { LibraryStatus } from "@prisma/client";
import { libraryStatusLabel } from "@/lib/library";

export function LibraryStatusBadge({ status, locale }: { status: LibraryStatus; locale: "en" | "fr" }) {
  return <span className={`library-status library-status-${status.toLowerCase()}`}>{libraryStatusLabel(status, locale)}</span>;
}
