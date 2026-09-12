import { HistoryEra, type Prisma } from "@prisma/client";
import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryPagination } from "@/components/library/LibraryPagination";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { LibraryCatalogueForm, LibraryLanguageFilter } from "@/components/library/LibraryCatalogueForm";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { historyEraLabel, libraryPage, milestoneTypeLabel } from "@/lib/library";
import { libraryCatalogueHref } from "@/lib/library-browser";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

export default async function LibraryHistoryPage({ searchParams }: { searchParams: Promise<{ era?: string; q?: string; page?: string; language?: string; sort?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const fr = locale === "fr";
  const era = Object.values(HistoryEra).includes(query.era as HistoryEra) ? query.era as HistoryEra : undefined;
  const q = query.q?.trim().slice(0, 160);
  const language = query.language === "fr" || query.language === "en" ? query.language : undefined;
  const sort = ["recent", "updated"].includes(query.sort ?? "") ? query.sort! : "oldest";
  const where: Prisma.HistoryMilestoneWhereInput = { AND: [
    visibleLibraryEntryWhere(user), era ? { era } : {},
    language ? { translations: { some: { language } } } : {},
    q ? { translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { summaryMarkdown: { contains: q, mode: "insensitive" } }, { yearLabel: { contains: q, mode: "insensitive" } }] } } } : {}
  ] };
  const total = await prisma.historyMilestone.count({ where });
  const pagination = libraryPage(query.page, total, PAGE_SIZE);
  const entries = await prisma.historyMilestone.findMany({ where, include: { translations: true }, orderBy: sort === "updated" ? [{ updatedAt: "desc" }, { id: "asc" }] : [{ sortYear: sort === "recent" ? "desc" : "asc" }, { id: "asc" }], skip: pagination.skip, take: pagination.take });
  const copy = libraryCopy[locale];
  const activeQuery = { q, era, language, sort: sort === "oldest" ? undefined : sort };
  const returnTo = libraryCatalogueHref("/library/history", { ...activeQuery, page: pagination.page > 1 ? String(pagination.page) : undefined });
  return <ForestPageLayout className="library-catalogue-page library-history-page" title={copy.history} description={fr ? "Découvertes, idées et rencontres à travers les siècles." : "Discoveries, ideas and encounters across the centuries."} heroImage="/art/history-forest-ruins.avif" heroAlt={fr ? "Ruines de pierre au milieu de collines boisées" : "Stone ruins among forested hills"} actions={isVerifiedContributor(user) && <Link className="button primary" href="/library/history/new"><Plus size={16} aria-hidden="true" />{fr ? "Ajouter un repère" : "Add a milestone"}</Link>}>
    <LibraryTabs active="history" locale={locale} />
    <div className="library-catalogue-workspace">
      <aside aria-label={fr ? "Filtres de l’histoire" : "History filters"}>
        <LibraryCatalogueForm locale={locale} pathname="/library/history" query={q} searchLabel={fr ? "Rechercher dans l’histoire" : "Search history"} activeCount={Number(Boolean(era)) + Number(Boolean(language))}>
          <label><span>{fr ? "Grande période" : "Historical period"}</span><select name="era" defaultValue={era ?? ""}><option value="">{fr ? "Toutes les périodes" : "All periods"}</option>{Object.values(HistoryEra).map(value => <option value={value} key={value}>{historyEraLabel(value, locale)}</option>)}</select></label>
          <LibraryLanguageFilter locale={locale} value={language} />
        </LibraryCatalogueForm>
      </aside>
      <section className="library-catalogue-results" aria-label={copy.history}>
        <div className="library-results-header"><p role="status">{total} {fr ? `repère${total === 1 ? "" : "s"}` : `milestone${total === 1 ? "" : "s"}`}</p><ProblemSortControl value={sort} defaultValue="oldest" label={fr ? "Trier :" : "Sort:"} ariaLabel={fr ? "Trier les repères" : "Sort milestones"} options={[{ value: "oldest", label: fr ? "Ordre chronologique" : "Chronological" }, { value: "recent", label: fr ? "Plus récents d’abord" : "Latest first" }, { value: "updated", label: fr ? "Modifiés récemment" : "Recently updated" }]} /></div>
        {entries.length ? <ol className="library-history-spreads" start={pagination.skip + 1}>{entries.map((entry, index) => {
          const translation = localizedTranslation(entry.translations, language ?? locale);
          const number = String(pagination.skip + index + 1).padStart(2, "0");
          const href = `/library/history/${entry.slug}?returnTo=${encodeURIComponent(returnTo)}${language ? `&lang=${language}` : ""}`;
          return <li key={entry.id}>
            <article className="library-history-spread">
              <figure className="library-history-figure">
                {entry.imageUrl ? <Link href={href as never} className="library-history-picture" tabIndex={-1} aria-hidden="true"><img src={entry.imageUrl} alt="" loading="lazy" /></Link> : <div className="library-history-placeholder"><ImageIcon size={30} strokeWidth={1.4} aria-hidden="true" /><span>{fr ? "Illustration à venir" : "Illustration to come"}</span></div>}
                {entry.imageUrl && <figcaption><span>Fig. {number}{entry.imageAlt ? ` — ${entry.imageAlt}` : ""}</span><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></figcaption>}
              </figure>
              <div className="library-history-story">
                <div className="library-history-dateline"><span className="library-history-number" aria-hidden="true">{number}</span><span>{translation?.yearLabel || entry.sortYear}</span>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div>
                <span className="sr-only">{milestoneTypeLabel(entry.milestoneType, locale)} · {historyEraLabel(entry.era, locale)}</span>
                <h2><Link href={href as never}>{translation?.title ?? entry.slug}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2>
                {translation?.summaryHtml && <div className="prose-math library-history-excerpt" dangerouslySetInnerHTML={{ __html: translation.summaryHtml }} />}
              </div>
            </article>
          </li>;
        })}</ol> : <LibraryEmptyState>{q || era || language ? <span>{fr ? "Aucun repère ne correspond à ces filtres." : "No milestones match these filters."} <a href="/library/history">{fr ? "Réinitialiser" : "Reset"}</a></span> : copy.noEntries}</LibraryEmptyState>}
        <LibraryPagination pathname="/library/history" query={activeQuery} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
      </section>
    </div>
  </ForestPageLayout>;
}
