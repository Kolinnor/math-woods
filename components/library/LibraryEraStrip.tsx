import Link from "next/link";
import { Settings2 } from "lucide-react";
import { libraryEraRange, libraryEraStyle, type LibraryEraView } from "@/lib/library-display";

/** The eras as quick filters (with the number of entries in each), above the history and mathematician catalogues. */
export function LibraryEraStrip({ locale, eras, counts, totalCount, active, hrefFor, allHref, allActive, label, manageHref }: {
  locale: "fr" | "en";
  eras: LibraryEraView[];
  counts: Record<string, number>;
  /** Count unique entries, including those without dates; era counts may overlap. */
  totalCount: number;
  active?: string | null;
  hrefFor: (slug: string) => string;
  allHref: string;
  /** Whether "all eras" is the current filter (defaults to no active era). */
  allActive?: boolean;
  label: string;
  /** Link to the era editor, for administrators. */
  manageHref?: string;
}) {
  return <nav className="library-era-strip" aria-label={label}>
    <ul>
      <li><Link href={allHref as never} aria-current={(allActive ?? !active) ? "true" : undefined}>{locale === "fr" ? "Toutes les époques" : "All eras"}<em>{totalCount}</em></Link></li>
      {eras.map((era, index) => {
        const count = counts[era.slug] ?? 0;
        return <li key={era.slug} style={libraryEraStyle(era)} data-empty={count ? undefined : "true"}>
          <Link href={hrefFor(era.slug) as never} aria-current={active === era.slug ? "true" : undefined} title={libraryEraRange(era, locale, index === eras.length - 1)}>
            <span className="library-era-dot" aria-hidden="true" />{era.name[locale]}<em>{count}</em>
          </Link>
        </li>;
      })}
      {manageHref && <li className="library-era-strip-manage"><Link href={manageHref as never} title={locale === "fr" ? "Modifier les époques" : "Edit the eras"}><Settings2 size={14} aria-hidden="true" /><span>{locale === "fr" ? "Modifier les époques" : "Edit the eras"}</span></Link></li>}
    </ul>
  </nav>;
}
