import type { Route } from "next";
import Link from "next/link";
import { BookOpenText } from "lucide-react";

export function ConceptContributorGuideLink({ label }: { label: string }) {
  return (
    <Link
      href={"/contributing/guides/concepts" as Route}
      className="concept-contributor-guide-link"
      target="_blank"
      rel="noreferrer"
    >
      <BookOpenText size={15} aria-hidden="true" />
      {label}
    </Link>
  );
}
