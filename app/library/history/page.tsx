import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryEraStrip } from "@/components/library/LibraryEraStrip";
import { LibraryFrise } from "@/components/library/LibraryFrise";
import { LibraryMilestoneTypeIcon } from "@/components/library/LibraryIcons";
import { LibraryPagination } from "@/components/library/LibraryPagination";
import { LibraryPersonPortrait } from "@/components/library/LibraryPersonPortrait";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { LibraryCatalogueForm, LibraryLanguageFilter } from "@/components/library/LibraryCatalogueForm";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryPage, milestoneTypeLabel } from "@/lib/library";
import { libraryCatalogueHref } from "@/lib/library-browser";
import { libraryCopy } from "@/lib/library-copy";
import { libraryDateLabel, libraryEraBySlug, libraryEraOfPeriod, libraryEraOfYear, libraryEraRange, libraryEraStyle } from "@/lib/library-display";
import { getLibraryEras } from "@/lib/library-eras";
import { historyEraWhere, milestoneEndYear, overlapsLibraryEra } from "@/lib/library-era-filters";
import { libraryFriseCandidates, selectFriseEra } from "@/lib/library-frise";
import { localizedTranslation, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { mathematicianPeriod } from "@/lib/mathematician-browser";
import { canUseAdminTools, isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

export default async function LibraryHistoryPage({ searchParams }: { searchParams: Promise<{ era?: string; q?: string; page?: string; language?: string; sort?: string }> }) {
  const [locale, user, query, eras] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams, getLibraryEras()]);
  const fr = locale === "fr";
  const selectedEra = libraryEraBySlug(eras, query.era);
  const era = selectedEra?.slug;
  const eraIndex = selectedEra ? eras.indexOf(selectedEra) : -1;
  const eraYears = selectedEra ? historyEraWhere(eras, selectedEra) : {};
  const q = query.q?.trim().slice(0, 160);
  const language = query.language === "fr" || query.language === "en" ? query.language : undefined;
  const sort = ["recent", "updated"].includes(query.sort ?? "") ? query.sort! : "oldest";
  const filters: Prisma.HistoryMilestoneWhereInput[] = [
    visibleLibraryEntryWhere(user),
    language ? { translations: { some: { language } } } : {},
    q ? { translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { summaryMarkdown: { contains: q, mode: "insensitive" } }, { yearLabel: { contains: q, mode: "insensitive" } }] } } } : {}
  ];
  const where: Prisma.HistoryMilestoneWhereInput = { AND: [...filters, eraYears] };
  const [total, years, candidates] = await Promise.all([
    prisma.historyMilestone.count({ where }),
    prisma.historyMilestone.findMany({ where: { AND: filters }, select: { sortYear: true, endYear: true, milestoneType: true } }),
    selectedEra ? libraryFriseCandidates(locale) : null
  ]);
  // One era seen up close, above its milestones.
  const zoom = selectedEra && candidates ? selectFriseEra(candidates, selectedEra, eras) : null;
  const pagination = libraryPage(query.page, total, PAGE_SIZE);
  const entries = await prisma.historyMilestone.findMany({
    where,
    include: {
      translations: true,
      mathematicians: { where: { mathematician: { status: "PUBLISHED" } }, orderBy: { position: "asc" }, take: 4, include: { mathematician: { select: { id: true, slug: true, name: true, lifespan: true, periodStartYear: true, periodEndYear: true, portraitUrl: true, portraitCrop: true, translations: { select: { language: true, displayName: true } } } } } }
    },
    orderBy: sort === "updated" ? [{ updatedAt: "desc" }, { id: "asc" }] : [{ sortYear: sort === "recent" ? "desc" : "asc" }, { id: "asc" }],
    skip: pagination.skip,
    take: pagination.take
  });
  const copy = libraryCopy[locale];
  const currentYear = new Date().getFullYear();
  const activeQuery = { q, era, language, sort: sort === "oldest" ? undefined : sort };
  const returnTo = libraryCatalogueHref("/library/history", { ...activeQuery, page: pagination.page > 1 ? String(pagination.page) : undefined });
  const eraCounts: Record<string, number> = {};
  for (const item of years) {
    for (const era of eras) if (overlapsLibraryEra(eras, era, item.sortYear, milestoneEndYear(item))) {
      eraCounts[era.slug] = (eraCounts[era.slug] ?? 0) + 1;
    }
  }
  // Chronological orders are grouped under era headings.
  const grouped = sort !== "updated" && !selectedEra;
  const Title = grouped ? "h3" : "h2";

  return <ForestPageLayout className="library-catalogue-page library-history-page" title={copy.history} description={fr ? "Découvertes, idées et rencontres à travers les siècles." : "Discoveries, ideas and encounters across the centuries."} heroImage="/art/history-forest-ruins.avif" heroAlt={fr ? "Ruines de pierre au milieu de collines boisées" : "Stone ruins among forested hills"} actions={isVerifiedContributor(user) && <Link className="button primary" href="/library/history/new"><Plus size={16} aria-hidden="true" />{fr ? "Ajouter un repère" : "Add a milestone"}</Link>}>
    <LibraryTabs active="history" locale={locale} />
    <div className="library-catalogue-workspace">
      <aside className="library-catalogue-aside" aria-label={fr ? "Filtres de l’histoire" : "History filters"}>
        <LibraryCatalogueForm locale={locale} pathname="/library/history" query={q} searchLabel={fr ? "Rechercher dans l’histoire" : "Search history"} activeCount={Number(Boolean(era)) + Number(Boolean(language))}>
          <label><span>{fr ? "Époque" : "Era"}</span><select name="era" defaultValue={era ?? ""}><option value="">{fr ? "Toutes les époques" : "All eras"}</option>{eras.map((value, index) => <option value={value.slug} key={value.slug}>{value.name[locale]} ({libraryEraRange(value, locale, index === eras.length - 1)})</option>)}</select></label>
          <LibraryLanguageFilter locale={locale} value={language} />
        </LibraryCatalogueForm>
      </aside>
      <section className="library-catalogue-results" aria-label={copy.history}>
        <LibraryEraStrip locale={locale} eras={eras} counts={eraCounts} totalCount={years.length} active={era ?? null} label={fr ? "Époques" : "Eras"}
          allHref={libraryCatalogueHref("/library/history", { ...activeQuery, era: undefined })}
          hrefFor={value => libraryCatalogueHref("/library/history", { ...activeQuery, era: value })}
          manageHref={canUseAdminTools(user) ? "/library/eras" : undefined} />
        {selectedEra && zoom && <section className="library-era-zoom" style={libraryEraStyle(selectedEra)} aria-label={fr ? `Frise : ${selectedEra.name.fr}` : `Timeline: ${selectedEra.name.en}`}>
          <div className="library-era-zoom-heading">
            <h2>{selectedEra.name[locale]}</h2>
            <span>{libraryEraRange(selectedEra, locale, eraIndex === eras.length - 1)}</span>
            {selectedEra.description[locale] && <p>{selectedEra.description[locale]}</p>}
          </div>
          <LibraryFrise locale={locale} eras={[selectedEra]} milestones={zoom.milestones} people={zoom.people} lanes={{ periods: 3, events: 6, people: 16 }} />
          <p className="library-era-zoom-note">
            {fr ? `La frise montre ${zoom.people.length} des ${zoom.totals.people} mathématiciens qui ont vécu à cette époque, en commençant par ceux choisis pour la frise et les fiches les plus complètes.` : `The timeline shows ${zoom.people.length} of the ${zoom.totals.people} mathematicians who lived in this era, starting with those chosen for the timeline and the most complete entries.`}
            {" "}<Link href={`/library/mathematicians?era=${selectedEra.slug}&languagesSet=1&language=fr&language=en` as never}>{fr ? "Voir tous les mathématiciens de l’époque" : "See every mathematician of the era"}</Link>
          </p>
        </section>}
        <div className="library-results-header"><p className="result-summary" role="status">{total} {fr ? `repère${total === 1 ? "" : "s"}` : `milestone${total === 1 ? "" : "s"}`}</p><ProblemSortControl value={sort} defaultValue="oldest" label={fr ? "Trier :" : "Sort:"} ariaLabel={fr ? "Trier les repères" : "Sort milestones"} options={[{ value: "oldest", label: fr ? "Ordre chronologique" : "Chronological" }, { value: "recent", label: fr ? "Plus récents d’abord" : "Latest first" }, { value: "updated", label: fr ? "Modifiés récemment" : "Recently updated" }]} /></div>
        {entries.length ? <ol className="library-timeline" data-grouped={grouped ? "true" : undefined}>{entries.flatMap((entry, index) => {
          const translation = localizedTranslation(entry.translations, language ?? locale);
          const entryEra = libraryEraOfYear(eras, entry.sortYear);
          const href = `/library/history/${entry.slug}?returnTo=${encodeURIComponent(returnTo)}${language ? `&lang=${language}` : ""}`;
          const previousEra = index > 0 ? libraryEraOfYear(eras, entries[index - 1].sortYear) : null;
          const heading = grouped && entryEra && entryEra !== previousEra
            ? [<li key={`era-${entryEra.slug}-${index}`} className="library-timeline-era" style={libraryEraStyle(entryEra)}><h2>{entryEra.name[locale]}</h2><span>{libraryEraRange(entryEra, locale, eras.indexOf(entryEra) === eras.length - 1)}</span>{entryEra.description[locale] && <p>{entryEra.description[locale]}</p>}</li>]
            : [];
          return [...heading, <li key={entry.id} className="library-timeline-item" style={libraryEraStyle(entryEra)} data-type={entry.milestoneType.toLowerCase()}>
            <p className="library-timeline-date">{translation?.yearLabel ? libraryDateLabel(translation.yearLabel) : entry.sortYear}</p>
            <article className="library-timeline-card">
              <div className="library-timeline-card-body">
                <p className="library-timeline-kicker"><LibraryMilestoneTypeIcon type={entry.milestoneType} size={14} />{milestoneTypeLabel(entry.milestoneType, locale)}{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</p>
                <Title><Link className="library-card-link" href={href as never}>{translation?.title ?? entry.slug}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</Title>
                {translation?.summaryHtml.trim() && <div className="prose-math library-excerpt" dangerouslySetInnerHTML={{ __html: translation.summaryHtml }} />}
                {entry.mathematicians.length > 0 && <ul className="library-timeline-people" aria-label={fr ? "Mathématiciens" : "Mathematicians"}>{entry.mathematicians.map(({ mathematician }) => {
                  const name = localizedTranslation(mathematician.translations, locale)?.displayName ?? mathematician.name;
                  const period = mathematicianPeriod(mathematician, currentYear);
                  return <li key={mathematician.id}><Link href={`/library/mathematicians/${mathematician.slug}` as never}>
                    <span className="library-thumb library-thumb-small"><LibraryPersonPortrait variant="thumb" name={name} portraitUrl={mathematician.portraitUrl} crop={mathematician.portraitCrop} era={period ? libraryEraOfPeriod(eras, period.from, period.to) : null} /></span>
                    <span>{name}</span>
                  </Link></li>;
                })}</ul>}
              </div>
              {entry.imageUrl && <div className="library-timeline-image"><img src={entry.imageUrl} alt="" loading="lazy" /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}
            </article>
          </li>];
        })}</ol> : <LibraryEmptyState>{q || era || language ? <span>{fr ? "Aucun repère ne correspond à ces filtres." : "No milestones match these filters."} <a href="/library/history">{fr ? "Réinitialiser" : "Reset"}</a></span> : copy.noEntries}</LibraryEmptyState>}
        <LibraryPagination pathname="/library/history" query={activeQuery} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
      </section>
    </div>
  </ForestPageLayout>;
}
