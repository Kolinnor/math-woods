import { HistoryEra } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryPagination } from "@/components/library/LibraryPagination";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { historyEraLabel, libraryPage, milestoneTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function LibraryHistoryPage({ searchParams }: { searchParams: Promise<{ era?: string; q?: string; page?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const era = Object.values(HistoryEra).includes(query.era as HistoryEra) ? query.era as HistoryEra : undefined;
  const q = query.q?.trim();
  const where = { AND: [visibleLibraryEntryWhere(user), era ? { era } : {}, q ? { translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { summaryMarkdown: { contains: q, mode: "insensitive" as const } }, { yearLabel: { contains: q, mode: "insensitive" as const } }] } } } : {}] };
  const total = await prisma.historyMilestone.count({ where });
  const pagination = libraryPage(query.page, total, PAGE_SIZE);
  const entries = await prisma.historyMilestone.findMany({ where, include: { translations: true }, orderBy: [{ sortYear: "asc" }, { createdAt: "asc" }], skip: pagination.skip, take: pagination.take });
  const copy = libraryCopy[locale];
  return (
    <ForestPageLayout title={copy.history} description={locale === "fr" ? "Une chronologie choisie des idées, notations et publications qui ont transformé les mathématiques." : "A selected timeline of ideas, notation, and publications that changed mathematics."} heroImage="/art/brook-in-the-forest.jpg" actions={user && isVerifiedContributor(user) ? <Link className="primary" href="/library/history/new"><Plus size={16} />{copy.add}</Link> : undefined}>
      <LibraryTabs active="history" locale={locale} />
      <form className="library-filter-bar"><input name="q" defaultValue={q} placeholder={locale === "fr" ? "Rechercher dans la chronologie" : "Search the timeline"} /><select name="era" defaultValue={era ?? ""}><option value="">{locale === "fr" ? "Toutes les périodes" : "All eras"}</option>{Object.values(HistoryEra).map((value) => <option value={value} key={value}>{historyEraLabel(value, locale)}</option>)}</select><button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button></form>
      {entries.length ? <ol className="library-timeline">{entries.map((entry) => {
        const translation = localizedTranslation(entry.translations, locale);
        return <li key={entry.id}><div className="library-timeline-date">{translation?.yearLabel ?? entry.sortYear}</div><article>{entry.imageUrl && <div className="library-timeline-image"><img src={entry.imageUrl} alt={entry.imageAlt ?? translation?.title ?? ""} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}<div className="library-card-heading"><p className="library-kicker">{milestoneTypeLabel(entry.milestoneType, locale)} · {historyEraLabel(entry.era, locale)}</p>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div><h2><Link href={`/library/history/${entry.slug}`}>{translation?.title ?? entry.slug}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2>{translation?.summaryHtml && <div className="prose-math library-summary" dangerouslySetInnerHTML={{ __html: translation.summaryHtml }} />}</article></li>;
      })}</ol> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
      <LibraryPagination pathname="/library/history" query={{ q, era }} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
    </ForestPageLayout>
  );
}
