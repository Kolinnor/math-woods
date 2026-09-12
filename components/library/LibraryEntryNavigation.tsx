import type { ReactNode } from "react";
import type { LibraryStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Languages, Pencil } from "lucide-react";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { FieldHelp } from "@/components/FieldHelp";

export function LibraryEntryRail({ locale, editHref, translateHref, attribution, management, className = "" }: {
  locale: "fr" | "en";
  editHref?: string;
  translateHref?: string;
  attribution?: ReactNode;
  management?: ReactNode;
  className?: string;
}) {
  return <aside className={`concept-detail-rail library-detail-rail ${className}`} aria-label={locale === "fr" ? "Actions et informations sur la fiche" : "Entry actions and information"}>
    {(editHref || translateHref) && <nav className="problem-rail-actions" aria-label={locale === "fr" ? "Actions sur la fiche" : "Entry actions"}>
      {editHref && <Link href={editHref as never}><span className="problem-rail-action-label"><Pencil size={16} aria-hidden="true" /><span>{locale === "fr" ? "Modifier" : "Edit"}</span></span></Link>}
      {translateHref && <Link href={translateHref as never}><span className="problem-rail-action-label"><Languages size={16} aria-hidden="true" /><span>{locale === "fr" ? "Traduire" : "Translate"}</span></span></Link>}
    </nav>}
    {attribution && <div className="concept-rail-section library-detail-attribution">{attribution}</div>}
    {management && <section className="concept-rail-section library-detail-management">{management}</section>}
  </aside>;
}

export function LibraryEntryToolbar({ locale, backHref, backLabel, href, languages, activeLanguage, status, reviewed }: {
  locale: "fr" | "en";
  backHref: string;
  backLabel: string;
  href: string;
  languages: string[];
  activeLanguage: string;
  status: LibraryStatus;
  reviewed: boolean;
}) {
  const languageName = (language: string) => language === "fr" ? "Français" : language === "en" ? "English" : language.toUpperCase();
  return <div className="library-detail-toolbar">
    <Link href={backHref as never} className="button secondary library-detail-back-link"><ArrowLeft size={16} aria-hidden="true" />{backLabel}</Link>
    <div className="library-detail-toolbar-meta">
      {languages.length > 1 ? <nav className="library-detail-languages" aria-label={locale === "fr" ? "Langue de la fiche" : "Entry language"}>
        {languages.map(language => <Link key={language} href={`${href}?lang=${encodeURIComponent(language)}&returnTo=${encodeURIComponent(backHref)}` as never} aria-current={language === activeLanguage ? "page" : undefined}>{languageName(language)}</Link>)}
      </nav> : <span className="library-detail-language">{languageName(activeLanguage)}</span>}
      <LibraryStatusBadge status={status} locale={locale} reviewed={reviewed} />
      <FieldHelp text={locale === "fr" ? "La relecture concerne le contenu présent. Une fiche relue peut encore être une ébauche à compléter. La publication et la relecture sont distinctes." : "Review concerns the existing content. A reviewed entry can still be a stub to expand. Publication and review are separate."} />
    </div>
  </div>;
}
