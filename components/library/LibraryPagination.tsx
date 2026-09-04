import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function pageHref(pathname: string, query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `${pathname}${suffix ? `?${suffix}` : ""}`;
}

export function LibraryPagination({
  pathname,
  query,
  page,
  totalPages,
  locale
}: {
  pathname: string;
  query: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  locale: "en" | "fr";
}) {
  if (totalPages <= 1) return null;
  const previousLabel = locale === "fr" ? "Page précédente" : "Previous page";
  const nextLabel = locale === "fr" ? "Page suivante" : "Next page";

  return (
    <nav className="pagination" aria-label={locale === "fr" ? "Pagination de la bibliothèque" : "Library pagination"}>
      {page > 1 ? (
        <Link href={pageHref(pathname, query, page - 1) as never} aria-label={previousLabel}>
          <ChevronLeft size={17} aria-hidden="true" />
        </Link>
      ) : <span aria-disabled="true"><ChevronLeft size={17} aria-hidden="true" /></span>}
      <span className="pagination-status">
        {locale === "fr" ? `Page ${page} sur ${totalPages}` : `Page ${page} of ${totalPages}`}
      </span>
      {page < totalPages ? (
        <Link href={pageHref(pathname, query, page + 1) as never} aria-label={nextLabel}>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
      ) : <span aria-disabled="true"><ChevronRight size={17} aria-hidden="true" /></span>}
    </nav>
  );
}
