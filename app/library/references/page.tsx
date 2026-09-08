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
import { formatLibraryReference, libraryPage, referenceTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { canEditLibraryReference, isVerifiedContributor } from "@/lib/permissions";
import { matchingReferenceIds } from "@/lib/reference-search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function LibraryReferencesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const type = Object.values(LibraryReferenceType).includes(query.type as LibraryReferenceType) ? query.type as LibraryReferenceType : undefined;
  const q = query.q?.trim().slice(0, 160);
  const matchingIds = q ? await matchingReferenceIds(prisma, q, { publishedOnly: false, includeDescriptions: true }) : null;
  const where: Prisma.LibraryReferenceWhereInput = {
      AND: [
        { searchable: true, mergedIntoId: null },
        // This management page requires an admin: include submissions to review.
        { OR: [visibleLibraryEntryWhere(user), { status: "PENDING_REVIEW" }] },
        type ? { referenceType: type } : {},
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
    orderBy: { canonicalTitle: "asc" },
    skip: pagination.skip,
    take: pagination.take
  });
  const copy = libraryCopy[locale];
  return (
    <ForestPageLayout title={copy.references} description={locale === "fr" ? "Une seule fiche par ouvrage, article, vidéo, chaîne ou site cité sur Math Woods." : "One record for every book, article, video, channel, or website cited on Math Woods."} heroImage="/art/oak-grove.jpg" actions={user && isVerifiedContributor(user) && <Link className="primary" href="/library/references/new"><Plus size={16} />{copy.add}</Link>}>
      <LibraryTabs active="references" locale={locale} />
      <form className="library-filter-bar">
        <input name="q" defaultValue={q} placeholder={locale === "fr" ? "Rechercher une référence" : "Search references"} />
        <select name="type" defaultValue={type ?? ""}><option value="">{locale === "fr" ? "Tous les types" : "All types"}</option>{Object.values(LibraryReferenceType).map((value) => <option value={value} key={value}>{referenceTypeLabel(value, locale)}</option>)}</select>
        <button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button>
      </form>
      {entries.length ? <div className="library-reference-list">{entries.map((entry) => {
        const translation = localizedTranslation(entry.translations, locale);
        const linkCount = entry._count.problemLinks + entry._count.conceptLinks + new Set(entry.mathematicianRelatedItems.map(item => item.translation.mathematicianId)).size + entry._count.milestoneLinks;
        return <article key={entry.id} className="library-reference-row">
          {entry.iconUrl && <img src={entry.iconUrl} alt="" style={{ width: Math.min(entry.iconSize, 88), height: Math.min(entry.iconSize, 88) }} />}
          <div><div className="library-card-heading"><p className="library-kicker">{referenceTypeLabel(entry.referenceType, locale)}</p>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div><h2><Link href={`/library/references/${entry.slug}`}>{translation?.displayTitle ?? entry.canonicalTitle}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2><p className="library-citation">{formatLibraryReference(entry)}</p><p className="library-reference-usage">{locale === "fr" ? `${linkCount} lien${linkCount > 1 ? "s" : ""} dans Math Woods` : `${linkCount} link${linkCount === 1 ? "" : "s"} on Math Woods`}</p></div>
          <div className="library-reference-row-actions">
            {canEditLibraryReference(user, entry) && <Link href={`/library/references/${entry.slug}/edit?lang=${locale}`} className="library-reference-edit" aria-label={`${copy.edit} : ${translation?.displayTitle ?? entry.canonicalTitle}`}><Pencil size={15} aria-hidden="true" />{copy.edit}</Link>}
            {entry.url && <a className="library-external-link" href={entry.url} rel="noreferrer" aria-label={locale === "fr" ? "Ouvrir la référence" : "Open reference"}><ExternalLink size={17} /></a>}
          </div>
        </article>;
      })}</div> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
      <LibraryPagination pathname="/library/references" query={{ q, type }} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
      <details className="library-catalogue-export">
        <summary>{locale === "fr" ? "Exporter le catalogue" : "Export the catalogue"}</summary>
        <div>
          <a href="/library/references/export?format=bibtex">{locale === "fr" ? "Télécharger en BibTeX" : "Download as BibTeX"}</a>
          <a href="/library/references/export?format=json">{locale === "fr" ? "Télécharger en JSON" : "Download as JSON"}</a>
        </div>
      </details>
    </ForestPageLayout>
  );
}
