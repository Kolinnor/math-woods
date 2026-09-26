import { LibraryReferenceType, Prisma } from "@prisma/client";
import Link from "next/link";
import { Download, ExternalLink, Link2, Pencil, Plus } from "lucide-react";
import { LibraryReferenceTypeIcon } from "@/components/library/LibraryIcons";
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
import { libraryCatalogueHref } from "@/lib/library-browser";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function LibraryReferencesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string; language?: string; sort?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const type = Object.values(LibraryReferenceType).includes(query.type as LibraryReferenceType) ? query.type as LibraryReferenceType : undefined;
  const q = query.q?.trim().slice(0, 160);
  const language = query.language === "fr" || query.language === "en" ? query.language : undefined;
  const sort = ["updated", "added"].includes(query.sort ?? "") ? query.sort! : "alphabetical";
  const matchingIds = q ? await matchingReferenceIds(prisma, q, { publishedOnly: false, includeDescriptions: true }) : null;
  const baseFilters: Prisma.LibraryReferenceWhereInput[] = [
    { searchable: true, mergedIntoId: null },
    // This management page requires an admin: include submissions to review.
    { OR: [visibleLibraryEntryWhere(user), { status: "PENDING_REVIEW" }] },
    language ? { translations: { some: { language } } } : {},
    matchingIds ? { id: { in: matchingIds } } : {}
  ];
  const where: Prisma.LibraryReferenceWhereInput = { AND: [...baseFilters, type ? { referenceType: type } : {}] };
  const [total, typeGroups] = await Promise.all([
    prisma.libraryReference.count({ where }),
    prisma.libraryReference.groupBy({ by: ["referenceType"], where: { AND: baseFilters }, _count: { _all: true } })
  ]);
  const typeCounts = new Map(typeGroups.map(group => [group.referenceType, group._count._all]));
  const allCount = typeGroups.reduce((sum, group) => sum + group._count._all, 0);
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
  const fr = locale === "fr";
  return (
    <ForestPageLayout className="library-catalogue-page library-references-page" title={copy.references} description={fr ? "Livres, articles et ressources pour prolonger la lecture." : "Books, articles and resources for further reading."} heroImage="/art/oak-grove.jpg" actions={user && isVerifiedContributor(user) && <Link className="button primary" href="/library/references/new"><Plus size={16} aria-hidden="true" />{fr ? "Ajouter une référence" : "Add a reference"}</Link>}>
      <LibraryTabs active="references" locale={locale} />
      <div className="library-catalogue-workspace">
        <aside className="library-catalogue-aside" aria-label={fr ? "Filtres des références" : "Reference filters"}>
          <LibraryCatalogueForm locale={locale} pathname="/library/references" query={q} searchLabel={fr ? "Rechercher une référence" : "Search references"} activeCount={Number(Boolean(type)) + Number(Boolean(language))}>
            <label><span>{fr ? "Type de référence" : "Reference type"}</span><select name="type" defaultValue={type ?? ""}><option value="">{fr ? "Tous les types" : "All types"}</option>{Object.values(LibraryReferenceType).map((value) => <option value={value} key={value}>{referenceTypeLabel(value, locale)}</option>)}</select></label>
            <LibraryLanguageFilter locale={locale} value={language} />
          </LibraryCatalogueForm>
        </aside>
        <section className="library-catalogue-results" aria-label={copy.references}>
          <nav className="library-type-filter" aria-label={fr ? "Types de références" : "Reference types"}>
            <Link href={libraryCatalogueHref("/library/references", { ...activeQuery, type: undefined }) as never} aria-current={!type ? "true" : undefined}>{fr ? "Tout" : "All"}<em>{allCount}</em></Link>
            {Object.values(LibraryReferenceType).filter(value => typeCounts.has(value) || value === type).map(value => <Link key={value} href={libraryCatalogueHref("/library/references", { ...activeQuery, type: value }) as never} aria-current={type === value ? "true" : undefined}>
              <LibraryReferenceTypeIcon type={value} size={15} />{referenceTypeLabel(value, locale)}<em>{typeCounts.get(value) ?? 0}</em>
            </Link>)}
          </nav>
          <div className="library-results-header"><p className="result-summary" role="status">{total} {fr ? `référence${total === 1 ? "" : "s"}` : `reference${total === 1 ? "" : "s"}`}</p><ProblemSortControl value={sort} defaultValue="alphabetical" label={fr ? "Trier :" : "Sort:"} ariaLabel={fr ? "Trier les références" : "Sort references"} options={[{ value: "alphabetical", label: fr ? "Ordre alphabétique" : "Alphabetical" }, { value: "added", label: fr ? "Ajoutées récemment" : "Recently added" }, { value: "updated", label: fr ? "Modifiées récemment" : "Recently updated" }]} /></div>
          {entries.length ? <ol className="library-ledger">{entries.map((entry) => {
            const translation = localizedTranslation(entry.translations, language ?? locale);
            const title = translation?.displayTitle ?? entry.canonicalTitle;
            const linkCount = entry._count.problemLinks + entry._count.conceptLinks + new Set(entry.mathematicianRelatedItems.map(item => item.translation.mathematicianId)).size + entry._count.milestoneLinks;
            const year = entry.yearLabel || entry.year?.toString();
            const byline = [entry.authors?.replace(/\s*\n\s*/g, ", "), entry.journal ?? entry.publisher].filter(Boolean).join(" · ");
            return <li key={entry.id} className="library-ledger-row" data-type={entry.referenceType.toLowerCase()}>
              <div className="library-ledger-icon">{entry.iconUrl ? <img src={entry.iconUrl} alt="" /> : <LibraryReferenceTypeIcon type={entry.referenceType} size={19} />}</div>
              <div className="library-ledger-main">
                <p className="library-ledger-kicker">{referenceTypeLabel(entry.referenceType, locale)}{year && <span>{year}</span>}{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</p>
                <h2><Link className="library-card-link" href={`/library/references/${entry.slug}?returnTo=${encodeURIComponent(returnTo)}${language ? `&lang=${language}` : ""}` as never}>{title}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2>
                {byline && <p className="library-ledger-byline">{byline}</p>}
              </div>
              <div className="library-ledger-side">
                {linkCount > 0 && <span className="library-ledger-usage" title={fr ? `Citée dans ${linkCount} fiche${linkCount > 1 ? "s" : ""}` : `Cited in ${linkCount} ${linkCount === 1 ? "entry" : "entries"}`}><Link2 size={14} aria-hidden="true" />{linkCount}<span className="sr-only">{fr ? ` fiche${linkCount > 1 ? "s" : ""} liée${linkCount > 1 ? "s" : ""}` : ` linked ${linkCount === 1 ? "entry" : "entries"}`}</span></span>}
                {canEditLibraryReference(user, entry) && <Link href={`/library/references/${entry.slug}/edit?lang=${locale}` as never} className="library-ledger-action" title={copy.edit} aria-label={`${copy.edit} : ${title}`}><Pencil size={15} aria-hidden="true" /></Link>}
                {entry.url && <a className="library-ledger-action" href={entry.url} rel="noreferrer" target="_blank" title={fr ? "Ouvrir la ressource" : "Open the resource"} aria-label={`${fr ? "Ouvrir" : "Open"} : ${title}`}><ExternalLink size={15} aria-hidden="true" /></a>}
              </div>
            </li>;
          })}</ol> : <LibraryEmptyState>{q || type || language ? <span>{fr ? "Aucune référence ne correspond à ces filtres." : "No references match these filters."} <a href="/library/references">{fr ? "Réinitialiser" : "Reset"}</a></span> : copy.noEntries}</LibraryEmptyState>}
          <LibraryPagination pathname="/library/references" query={activeQuery} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
          <details className="library-catalogue-export">
            <summary><Download size={15} aria-hidden="true" />{fr ? "Exporter le catalogue" : "Export the catalogue"}</summary>
            <div>
              <a href="/library/references/export?format=bibtex">{fr ? "Télécharger en BibTeX" : "Download as BibTeX"}</a>
              <a href="/library/references/export?format=json">{fr ? "Télécharger en JSON" : "Download as JSON"}</a>
            </div>
          </details>
        </section>
      </div>
    </ForestPageLayout>
  );
}
