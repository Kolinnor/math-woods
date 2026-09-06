import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryReviewActions } from "@/components/library/LibraryReviewActions";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { formatLibraryReference, referenceRoleLabel, referenceTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { referenceBibtexReport } from "@/lib/reference-bibtex";
import { localizedTranslation } from "@/lib/library-queries";
import { canArchiveLibraryEntry, canEditLibraryReference, canReviewLibraryEntry, canViewLibraryEntry } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function LibraryReferencePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ duplicate?: string }> }) {
  const { slug } = await params;
  const [locale, user, query, entry] = await Promise.all([
    getInterfaceLocale(), requireAdmin(), searchParams,
    prisma.libraryReference.findUnique({
      where: { slug },
      include: {
        mergedInto: { select: { slug: true } },
        work: true,
        editions: { where: { status: "PUBLISHED", searchable: true, mergedIntoId: null }, orderBy: [{ year: "asc" }, { id: "asc" }] },
        translations: true,
        createdBy: true,
        reviewedBy: true,
        problemLinks: { where: { problem: { listed: true, status: "PUBLISHED" } }, include: { problem: true }, orderBy: { position: "asc" } },
        conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } }, include: { concept: true }, orderBy: { position: "asc" } },
        mathematicianWorks: { where: { mathematician: { status: "PUBLISHED" } }, include: { mathematician: { include: { translations: true } } }, orderBy: { position: "asc" } },
        milestoneLinks: { where: { milestone: { status: "PUBLISHED" } }, include: { milestone: { include: { translations: true } } }, orderBy: { position: "asc" } }
      }
    })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  if (entry.mergedInto) permanentRedirect(`/library/references/${entry.mergedInto.slug}`);
  const translation = localizedTranslation(entry.translations, locale);
  const copy = libraryCopy[locale];
  const bibliography = referenceBibtexReport(entry, locale);
  return (
    <ForestPageLayout title={<>{translation?.displayTitle ?? entry.canonicalTitle}{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</>} description={referenceTypeLabel(entry.referenceType, locale)} heroImage="/art/oak-grove.jpg">
      <LibraryTabs active="references" locale={locale} />
      {query.duplicate && <p className="quality-banner">{locale === "fr" ? "Cette référence existe déjà : vous avez été redirigé vers sa fiche." : "This reference already exists, so you were redirected to its record."}</p>}
      <div className="library-detail-heading"><LibraryStatusBadge status={entry.status} locale={locale} /></div>
      <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />
      <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
      <article className="panel library-reference-detail">
        <div className="library-reference-heading">
          <div className="library-reference-title-row">{entry.iconUrl && <div className="library-reference-icon-wrap"><img src={entry.iconUrl} alt={entry.imageAlt ?? ""} style={{ width: entry.iconSize, height: entry.iconSize }} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}<p className="library-citation">{formatLibraryReference(entry)}</p></div>
          {user && canEditLibraryReference(user, entry) && <Link href={`/library/references/${entry.slug}/edit?lang=${locale}`} className="button primary"><Pencil size={16} aria-hidden="true" />{copy.edit}</Link>}
        </div>
        {entry.url && <a className="button secondary" href={entry.url} rel="noreferrer"><ExternalLink size={16} />{locale === "fr" ? "Consulter" : "Open"}</a>}
        {entry.work && <p>{locale === "fr" ? "Édition de : " : "Edition of: "}<Link href={`/library/references/${entry.work.slug}`}>{entry.work.canonicalTitle}</Link></p>}
        {entry.editions.length > 0 && <details className="library-form-section"><summary>{locale === "fr" ? `Éditions et traductions (${entry.editions.length})` : `Editions and translations (${entry.editions.length})`}</summary><ul>{entry.editions.map(edition => <li key={edition.id}><Link href={`/library/references/${edition.slug}`}>{formatLibraryReference(edition)}</Link></li>)}</ul></details>}
        <details className="library-form-section"><summary>{locale === "fr" ? "Détails bibliographiques et BibTeX" : "Bibliographic details and BibTeX"}</summary><div>
          <dl className="library-metadata">{([
            ["DOI", entry.doi], ["ISBN", entry.isbn], [locale === "fr" ? "Clé de citation" : "Citation key", bibliography.key],
            [locale === "fr" ? "Édition" : "Edition", entry.edition], ["Volume", entry.volume],
            [locale === "fr" ? "Traducteurs" : "Translators", entry.translator], [locale === "fr" ? "Responsables de l’édition" : "Editors", entry.editors],
            [locale === "fr" ? "Revue" : "Journal", entry.journal], [locale === "fr" ? "Numéro" : "Issue", entry.issue], ["Pages", entry.pages]
          ] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {[...bibliography.errors, ...bibliography.warnings].map((message, index) => <p className="muted" key={index}>{message}</p>)}
          <pre className="library-bibtex">{bibliography.text}</pre>
        </div></details>
        {translation?.descriptionHtml && <div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.descriptionHtml }} />}
        {(entry.problemLinks.length > 0 || entry.conceptLinks.length > 0 || entry.mathematicianWorks.length > 0 || entry.milestoneLinks.length > 0) && <section><h2>{locale === "fr" ? "Liens dans Math Woods" : "Links on Math Woods"}</h2><ul className="library-bibliography">{entry.problemLinks.map((link) => <li key={`p-${link.id}`}><Link href={`/problems/${link.problem.slug}`}>{link.problem.title}</Link><ContentLanguageFallback language={link.problem.language} expectedLanguage={locale} /> · {referenceRoleLabel(link.role, locale)}{link.locator ? `, ${link.locator}` : ""}</li>)}{entry.conceptLinks.map((link) => <li key={`c-${link.id}`}><Link href={`/concepts/${link.concept.slug}`}>{link.concept.title}</Link><ContentLanguageFallback language={link.concept.language} expectedLanguage={locale} /> · {referenceRoleLabel(link.role, locale)}{link.locator ? `, ${link.locator}` : ""}</li>)}{entry.mathematicianWorks.map(({ mathematician, note }) => { const t = localizedTranslation(mathematician.translations, locale); return <li key={`m-${mathematician.id}`}><Link href={`/library/mathematicians/${mathematician.slug}`}>{t?.displayName ?? mathematician.name}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}{note ? ` · ${note}` : ""}</li>; })}{entry.milestoneLinks.map(({ milestone, note }) => { const t = localizedTranslation(milestone.translations, locale); return <li key={`h-${milestone.id}`}><Link href={`/library/history/${milestone.slug}`}>{t?.title ?? milestone.slug}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}{note ? ` · ${note}` : ""}</li>; })}</ul></section>}
        {user && <LibraryReviewActions entity="reference" id={entry.id} locale={locale} status={entry.status} canReview={canReviewLibraryEntry(user, entry)} canArchive={canArchiveLibraryEntry(user)} />}
      </article>
    </ForestPageLayout>
  );
}
