import { LibraryReferenceType, Prisma } from "@prisma/client";
import Link from "next/link";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryPagination } from "@/components/library/LibraryPagination";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryPage, referenceTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { canEditLibraryReference, isVerifiedContributor } from "@/lib/permissions";
import { matchingReferenceIds } from "@/lib/reference-search";
import { LibraryCatalogueForm, LibraryLanguageFilter } from "@/components/library/LibraryCatalogueForm";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { libraryCatalogueHref, libraryReferenceSummary } from "@/lib/library-browser";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function LibraryReferencesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string; language?: string; sort?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const type = Object.values(LibraryReferenceType).includes(query.type as LibraryReferenceType) ? query.type as LibraryReferenceType : undefined;
  const q = query.q?.trim().slice(0, 160);
  const language = query.language === "fr" || query.language === "en" ? query.language : undefined;
  const sort = ["updated", "added"].includes(query.sort ?? "") ? query.sort! : "alphabetical";
  const matchingIds = q ? await matchingReferenceIds(prisma, q, { publishedOnly: false, includeDescriptions: true }) : null;
  const where: Prisma.LibraryReferenceWhereInput = {
      AND: [
        { searchable: true, mergedIntoId: null },
        // This management page requires an admin: include submissions to review.
        { OR: [visibleLibraryEntryWhere(user), { status: "PENDING_REVIEW" }] },
        type ? { referenceType: type } : {},
        language ? { translations: { some: { language } } } : {},
        matchingIds ? { id: { in: matchingIds } } : {}
      ]
    };
  const total = await prisma.libraryReference.count({ where });
  const pagination = libraryPage(query.page, total, PAGE_SIZE);
  const entries = await prisma.libraryReference.findMany({
    where,
    include: { translations: true, mathematicianRelatedItems: { where: { translation: { mathematician: { status: "PUBLISHED" } } }, select: { translation: { select: { mathematicianId: true } } } }, _count: { select: {
      problemLinks: { where: { problem: { listed: true, status: "PUBLISHED" } } },
      conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } } },
      milestoneLinks: { where: { milestone: { status: "PUBLISHED" } } }
    } } },
    orderBy: sort === "updated" ? [{ updatedAt: "desc" }, { id: "asc" }] : sort === "added" ? [{ createdAt: "desc" }, { id: "asc" }] : [{ canonicalTitle: "asc" }, { id: "asc" }],
    skip: pagination.skip,
    take: pagination.take
  });
  const copy = libraryCopy[locale];
  const activeQuery = { q, type, language, sort: sort === "alphabetical" ? undefined : sort };
  const returnTo = libraryCatalogueHref("/library/references", { ...activeQuery, page: pagination.page > 1 ? String(pagination.page) : undefined });
  return (
    <ForestPageLayout className="library-catalogue-page" title={copy.references} description={locale === "fr" ? "Livres, articles et ressources pour prolonger la lecture." : "Books, articles and resources for further reading."} heroImage="/art/oak-grove.jpg" actions={user && isVerifiedContributor(user) && <Link className="button primary" href="/library/references/new"><Plus size={16} aria-hidden="true" />{locale === "fr" ? "Ajouter une référence" : "Add a reference"}</Link>}>
      <LibraryTabs active="references" locale={locale} />
      <div className="library-catalogue-workspace">
      <aside aria-label={locale === "fr" ? "Filtres des références" : "Reference filters"}>
        <LibraryCatalogueForm locale={locale} pathname="/library/references" query={q} searchLabel={locale === "fr" ? "Rechercher une référence" : "Search references"} activeCount={Number(Boolean(type)) + Number(Boolean(language))}>
          <label><span>{locale === "fr" ? "Type de référence" : "Reference type"}</span><select name="type" defaultValue={type ?? ""}><option value="">{locale === "fr" ? "Tous les types" : "All types"}</option>{Object.values(LibraryReferenceType).map((value) => <option value={value} key={value}>{referenceTypeLabel(value, locale)}</option>)}</select></label>
          <LibraryLanguageFilter locale={locale} value={language} />
        </LibraryCatalogueForm>
      </aside>
      <section className="library-catalogue-results" aria-label={copy.references}>
      <div className="library-results-header"><p role="status">{total} {locale === "fr" ? `référence${total === 1 ? "" : "s"}` : `reference${total === 1 ? "" : "s"}`}</p><ProblemSortControl value={sort} defaultValue="alphabetical" label={locale === "fr" ? "Trier :" : "Sort:"} ariaLabel={locale === "fr" ? "Trier les références" : "Sort references"} options={[{ value: "alphabetical", label: locale === "fr" ? "Ordre alphabétique" : "Alphabetical" }, { value: "added", label: locale === "fr" ? "Ajoutées récemment" : "Recently added" }, { value: "updated", label: locale === "fr" ? "Modifiées récemment" : "Recently updated" }]} /></div>
      {entries.length ? <div className="library-reference-list">{entries.map((entry) => {
        const translation = localizedTranslation(entry.translations, language ?? locale);
        const linkCount = entry._count.problemLinks + entry._count.conceptLinks + new Set(entry.mathematicianRelatedItems.map(item => item.translation.mathematicianId)).size + entry._count.milestoneLinks;
        return <article key={entry.id} className="library-reference-row">
          {entry.iconUrl && <img src={entry.iconUrl} alt="" style={{ width: Math.min(entry.iconSize, 88), height: Math.min(entry.iconSize, 88) }} />}
          <div><div className="library-card-heading"><p className="library-kicker">{referenceTypeLabel(entry.referenceType, locale)}</p>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div><h2><Link href={`/library/references/${entry.slug}?returnTo=${encodeURIComponent(returnTo)}${language ? `&lang=${language}` : ""}`}>{translation?.displayTitle ?? entry.canonicalTitle}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2>{libraryReferenceSummary(entry) && <p className="library-citation">{libraryReferenceSummary(entry)}</p>}{linkCount > 0 && <p className="library-reference-usage">{locale === "fr" ? `Cité dans ${linkCount} fiche${linkCount > 1 ? "s" : ""}` : `Cited in ${linkCount} ${linkCount === 1 ? "entry" : "entries"}`}</p>}</div>
          <div className="library-reference-row-actions">
            {canEditLibraryReference(user, entry) && <Link href={`/library/references/${entry.slug}/edit?lang=${locale}`} className="library-reference-edit" title={copy.edit} aria-label={`${copy.edit} : ${translation?.displayTitle ?? entry.canonicalTitle}`}><Pencil size={16} aria-hidden="true" /></Link>}
            {entry.url && <a className="library-external-link" href={entry.url} rel="noreferrer" aria-label={locale === "fr" ? "Ouvrir la référence" : "Open reference"}><ExternalLink size={17} /></a>}
          </div>
        </article>;
      })}</div> : <LibraryEmptyState>{q || type || language ? <span>{locale === "fr" ? "Aucune référence ne correspond à ces filtres." : "No references match these filters."} <a href="/library/references">{locale === "fr" ? "Réinitialiser" : "Reset"}</a></span> : copy.noEntries}</LibraryEmptyState>}
      <LibraryPagination pathname="/library/references" query={activeQuery} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
      <details className="library-catalogue-export">
        <summary>{locale === "fr" ? "Exporter le catalogue" : "Export the catalogue"}</summary>
        <div>
          <a href="/library/references/export?format=bibtex">{locale === "fr" ? "Télécharger en BibTeX" : "Download as BibTeX"}</a>
          <a href="/library/references/export?format=json">{locale === "fr" ? "Télécharger en JSON" : "Download as JSON"}</a>
        </div>
      </details>
      </section>
      </div>
    </ForestPageLayout>
  );
}
