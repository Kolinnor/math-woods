import type { ReactNode } from "react";
import type { LibraryStatus } from "@prisma/client";
import Link from "next/link";
import { Languages, Pencil } from "lucide-react";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { FieldHelp } from "@/components/FieldHelp";
import { libraryCopy } from "@/lib/library-copy";

export function LibraryEntryRail({ locale, editHref, translateHref, attribution, children, className = "" }: {
  locale: "fr" | "en";
  editHref?: string;
  translateHref?: string;
  attribution?: ReactNode;
  /** Extra rail sections, shown after the actions. */
  children?: ReactNode;
  className?: string;
}) {
  // Same rail as the concept and problem pages.
  return <aside className={`concept-detail-rail library-detail-rail ${className}`} aria-label={locale === "fr" ? "Actions et informations sur la fiche" : "Entry actions and information"}>
    {(editHref || translateHref) && <nav className="problem-rail-actions" aria-label={locale === "fr" ? "Actions sur la fiche" : "Entry actions"}>
      {editHref && <Link href={editHref as never}><span className="problem-rail-action-label"><Pencil size={16} aria-hidden="true" /><span>{locale === "fr" ? "Modifier" : "Edit"}</span></span></Link>}
      {translateHref && <Link href={translateHref as never}><span className="problem-rail-action-label"><Languages size={16} aria-hidden="true" /><span>{locale === "fr" ? "Traduire" : "Translate"}</span></span></Link>}
    </nav>}
    {children}
    {attribution && <div className="concept-rail-section library-detail-attribution">{attribution}</div>}
  </aside>;
}

/** Breadcrumb shown above the title of an entry; the section link returns to the filtered catalogue. */
export function LibraryBreadcrumb({ locale, section, backHref }: {
  locale: "fr" | "en";
  section: "history" | "mathematicians" | "references";
  backHref: string;
}) {
  const copy = libraryCopy[locale];
  return <>
    <Link href="/library" className="library-breadcrumb-root">{copy.title}</Link>
    <span aria-hidden="true" className="library-breadcrumb-separator">/</span>
    <Link href={backHref as never} className="library-detail-back-link">{copy[section]}</Link>
  </>;
}

/** Language versions and review status of an entry, under its title. */
export function LibraryEntryToolbar({ locale, backHref, href, languages, activeLanguage, status, reviewed, children }: {
  locale: "fr" | "en";
  backHref: string;
  href: string;
  languages: string[];
  activeLanguage: string;
  status: LibraryStatus;
  reviewed: boolean;
  /** Facts shown first on the line (dates, type…). */
  children?: ReactNode;
}) {
  const languageName = (language: string) => language === "fr" ? "Français" : language === "en" ? "English" : language.toUpperCase();
  // Keep the catalogue filters when switching language; the plain catalogue needs no return link.
  const returnSuffix = backHref.includes("?") ? `&returnTo=${encodeURIComponent(backHref)}` : "";
  return <div className="library-detail-toolbar">
    {children && <div className="library-detail-facts">{children}</div>}
    <div className="library-detail-toolbar-meta">
      {languages.length > 1 ? <nav className="library-detail-languages" aria-label={locale === "fr" ? "Langue de la fiche" : "Entry language"}>
        {languages.map(language => <Link key={language} href={`${href}?lang=${encodeURIComponent(language)}${returnSuffix}` as never} aria-current={language === activeLanguage ? "page" : undefined} lang={language}>{languageName(language)}</Link>)}
      </nav> : <span className="library-detail-language" lang={activeLanguage}>{languageName(activeLanguage)}</span>}
      <LibraryStatusBadge status={status} locale={locale} reviewed={reviewed} />
      <FieldHelp text={locale === "fr" ? "La relecture concerne le contenu présent. Une fiche relue peut encore être une ébauche à compléter. La publication et la relecture sont distinctes." : "Review concerns the existing content. A reviewed entry can still be a stub to expand. Publication and review are separate."} />
    </div>
  </div>;
}
