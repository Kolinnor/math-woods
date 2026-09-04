import { LibraryReferenceType, Prisma } from "@prisma/client";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
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
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function LibraryReferencesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const type = Object.values(LibraryReferenceType).includes(query.type as LibraryReferenceType) ? query.type as LibraryReferenceType : undefined;
  const q = query.q?.trim();
  const where: Prisma.LibraryReferenceWhereInput = {
      AND: [
        visibleLibraryEntryWhere(user),
        type ? { referenceType: type } : {},
        q ? { OR: [{ canonicalTitle: { contains: q, mode: "insensitive" } }, { authors: { contains: q, mode: "insensitive" } }, { publisher: { contains: q, mode: "insensitive" } }, { doi: { contains: q, mode: "insensitive" } }, { isbn: { contains: q, mode: "insensitive" } }, { citationKey: { contains: q, mode: "insensitive" } }, { url: { contains: q, mode: "insensitive" } }, { aliases: { has: q } }, { translations: { some: { OR: [{ displayTitle: { contains: q, mode: "insensitive" } }, { descriptionMarkdown: { contains: q, mode: "insensitive" } }] } } }] } : {}
      ]
    };
  const total = await prisma.libraryReference.count({ where });
  const pagination = libraryPage(query.page, total, PAGE_SIZE);
  const entries = await prisma.libraryReference.findMany({
    where,
    include: { translations: true, _count: { select: {
      problemLinks: { where: { problem: { listed: true, status: "PUBLISHED" } } },
      conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } } },
      mathematicianWorks: { where: { mathematician: { status: "PUBLISHED" } } },
      milestoneLinks: { where: { milestone: { status: "PUBLISHED" } } }
    } } },
    orderBy: { canonicalTitle: "asc" },
    skip: pagination.skip,
    take: pagination.take
  });
  const copy = libraryCopy[locale];
  return (
    <ForestPageLayout title={copy.references} description={locale === "fr" ? "Une seule fiche par ouvrage, article, vidéo, chaîne ou site cité sur Math Woods." : "One record for every book, article, video, channel, or website cited on Math Woods."} heroImage="/art/oak-grove.jpg" actions={<><a className="button secondary" href="/library/references/export?format=bibtex">BibTeX</a><a className="button secondary" href="/library/references/export?format=json">JSON</a>{user && isVerifiedContributor(user) && <Link className="primary" href="/library/references/new"><Plus size={16} />{copy.add}</Link>}</>}>
      <LibraryTabs active="references" locale={locale} />
      <form className="library-filter-bar">
        <input name="q" defaultValue={q} placeholder={locale === "fr" ? "Rechercher une référence" : "Search references"} />
        <select name="type" defaultValue={type ?? ""}><option value="">{locale === "fr" ? "Tous les types" : "All types"}</option>{Object.values(LibraryReferenceType).map((value) => <option value={value} key={value}>{referenceTypeLabel(value, locale)}</option>)}</select>
        <button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button>
      </form>
      {entries.length ? <div className="library-reference-list">{entries.map((entry) => {
        const translation = localizedTranslation(entry.translations, locale);
        const linkCount = entry._count.problemLinks + entry._count.conceptLinks + entry._count.mathematicianWorks + entry._count.milestoneLinks;
        return <article key={entry.id} className="library-reference-row">
          {entry.iconUrl && <img src={entry.iconUrl} alt="" style={{ width: Math.min(entry.iconSize, 88), height: Math.min(entry.iconSize, 88) }} />}
          <div><div className="library-card-heading"><p className="library-kicker">{referenceTypeLabel(entry.referenceType, locale)}</p>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div><h2><Link href={`/library/references/${entry.slug}`}>{translation?.displayTitle ?? entry.canonicalTitle}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2><p className="library-citation">{formatLibraryReference(entry)}</p><p className="library-reference-usage">{locale === "fr" ? `${linkCount} lien${linkCount > 1 ? "s" : ""} dans Math Woods` : `${linkCount} link${linkCount === 1 ? "" : "s"} on Math Woods`}</p></div>
          {entry.url && <a className="library-external-link" href={entry.url} rel="noreferrer" aria-label={locale === "fr" ? "Ouvrir la référence" : "Open reference"}><ExternalLink size={17} /></a>}
        </article>;
      })}</div> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
      <LibraryPagination pathname="/library/references" query={{ q, type }} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
    </ForestPageLayout>
  );
}
