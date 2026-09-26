import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LibraryCatalogueForm } from "@/components/library/LibraryCatalogueForm";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { FieldHelp } from "@/components/FieldHelp";
import { PortraitSource } from "@/components/library/PortraitSource";
import { LibraryEraStrip } from "@/components/library/LibraryEraStrip";
import { LibraryPersonPortrait } from "@/components/library/LibraryPersonPortrait";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryPagination } from "@/components/library/LibraryPagination";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { MathematicianPeriodFilter } from "@/components/library/MathematicianPeriodFilter";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryPage } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { libraryEraBySlug, libraryEraOfPeriod, libraryEraStyle } from "@/lib/library-display";
import { getLibraryEras, libraryEraPresets } from "@/lib/library-eras";
import { visibleLibraryEntryWhere } from "@/lib/library-queries";
import { canUseAdminTools, hasTrustedPrivileges, isVerifiedContributor } from "@/lib/permissions";
import { MIN_HISTORY_YEAR, browserValue, filterMathematicians, mathematiciansHref, parseMathematicianFilters, type BrowserQuery } from "@/lib/mathematician-browser";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

export default async function LibraryMathematiciansPage({ searchParams }: { searchParams: Promise<BrowserQuery> }) {
  const [locale, user, query, eras] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams, getLibraryEras()]);
  const fr = locale === "fr", currentYear = new Date().getFullYear();
  const presets = libraryEraPresets(eras, MIN_HISTORY_YEAR);
  const filters = parseMathematicianFilters(query, locale, currentYear, presets);
  const visible = visibleLibraryEntryWhere(user);
  const where: Prisma.MathematicianWhereInput = {
    AND: [filters.review && hasTrustedPrivileges(user.role) ? { OR: [visible, { status: "PENDING_REVIEW" }] } : visible,
      { translations: { some: { language: { in: filters.languages } } } }]
  };
  const people = await prisma.mathematician.findMany({ where, select: {
    id: true, name: true, aliases: true, lifespan: true, periodStartYear: true, periodEndYear: true,
    status: true, needsReviewAfterEdit: true, createdAt: true, updatedAt: true,
    translations: { select: { language: true, displayName: true, sortName: true, teaser: true, biographyHtml: true, contributionsHtml: true } }
  } });
  const matches = filterMathematicians(people, filters, locale, currentYear);
  // Number of people in each era with the other filters applied, for the era strip.
  const eraCounts: Record<string, number> = {};
  const allEraMatches = filterMathematicians(people, { ...filters, era: "", period: null }, locale, currentYear);
  for (const { period } of allEraMatches) {
    if (!period) continue;
    for (const preset of presets) if (period.from <= preset.to && period.to >= preset.from) {
      eraCounts[preset.value] = (eraCounts[preset.value] ?? 0) + 1;
    }
  }
  const pagination = libraryPage(browserValue(query.page), matches.length, PAGE_SIZE);
  const selected = matches.slice(pagination.skip, pagination.skip + pagination.take);
  const rows = await prisma.mathematician.findMany({ where: { AND: [where, { id: { in: selected.map(row => row.person.id) } }] }, include: { translations: true } });
  const rowById = new Map(rows.map(row => [row.id, row]));
  const copy = libraryCopy[locale];
  const canAdd = isVerifiedContributor(user);
  const activeQuery: BrowserQuery = {
    q: filters.q, languagesSet: "1", language: filters.languages, sort: filters.sort === "alphabetical" ? undefined : filters.sort,
    era: filters.era, from: !filters.era && filters.period ? String(filters.period.from) : undefined,
    to: !filters.era && filters.period ? String(filters.period.to) : undefined,
    review: filters.review ? "1" : undefined, stub: filters.stub ? "1" : undefined
  };
  const returnTo = mathematiciansHref({ ...activeQuery, page: pagination.page > 1 ? String(pagination.page) : undefined });
  const sortOptions = [
    { value: "alphabetical", label: fr ? "Ordre alphabétique" : "Alphabetical" },
    { value: "oldest", label: fr ? "Personnes les plus anciennes" : "Earliest people" },
    { value: "recent", label: fr ? "Personnes les plus récentes" : "Most recent people" },
    { value: "added", label: fr ? "Dernières fiches ajoutées" : "Recently added entries" },
    { value: "updated", label: fr ? "Dernières fiches modifiées" : "Recently updated entries" }
  ];
  return <ForestPageLayout className="library-catalogue-page mathematician-browser" title={copy.mathematicians} description={fr ? "Les personnes et les idées qui ont façonné les mathématiques." : "The people and ideas that shaped mathematics."} heroImage="/art/birch-grove.jpg" actions={canAdd && <Link className="button primary" href="/library/mathematicians/new"><Plus size={16} aria-hidden="true" />{copy.addMathematician}</Link>}>
    <LibraryTabs active="mathematicians" locale={locale} />
    <div className="library-catalogue-workspace">
      <aside className="library-catalogue-aside" aria-label={fr ? "Filtres des mathématiciens" : "Mathematician filters"}>
        <LibraryCatalogueForm key={locale} locale={locale} pathname="/library/mathematicians" query={filters.q} searchLabel={fr ? "Rechercher un mathématicien" : "Search mathematicians"} activeCount={Number(Boolean(filters.period)) + Number(filters.review) + Number(filters.stub) + Number(filters.languages.length !== 1 || filters.languages[0] !== locale)}>
          <MathematicianPeriodFilter locale={locale} currentYear={currentYear} initialEra={filters.era} initialPeriod={filters.period} presets={presets} />
          <div className="problem-filter-section"><fieldset className="problem-language-filter"><legend>{fr ? "Langues" : "Languages"}</legend>
            <input type="hidden" name="languagesSet" value="1" />
            {(["fr", "en"] as const).map(language => <label key={language}><input name="language" type="checkbox" value={language} defaultChecked={filters.languages.includes(language)} /><span>{language === "fr" ? "Français" : "English"}</span></label>)}
          </fieldset></div>
          <div className="problem-filter-section"><fieldset className="problem-language-filter"><legend>Contribution <FieldHelp text={fr ? "Retrouvez les fiches à relire ou les ébauches. Cocher les deux affiche celles qui répondent à au moins un de ces critères. Les droits d’accès restent applicables." : "Find entries awaiting review or stubs. Selecting both matches either condition. Access permissions still apply."} /></legend>
            <label><input type="checkbox" name="review" value="1" defaultChecked={filters.review} /><span>{fr ? "À relire" : "Awaiting review"}</span></label>
            <label><input type="checkbox" name="stub" value="1" defaultChecked={filters.stub} /><span>{fr ? "Ébauches" : "Stubs"}</span></label>
          </fieldset></div>
        </LibraryCatalogueForm>
      </aside>
      <section className="library-catalogue-results" aria-label={copy.mathematicians}>
        <LibraryEraStrip locale={locale} eras={eras} counts={eraCounts} totalCount={allEraMatches.length} active={libraryEraBySlug(eras, filters.era)?.slug ?? null} allActive={!filters.period}
          label={fr ? "Époques" : "Eras"} allHref={mathematiciansHref({ ...activeQuery, era: undefined, from: undefined, to: undefined })}
          hrefFor={era => mathematiciansHref({ ...activeQuery, era, from: undefined, to: undefined })}
          manageHref={canUseAdminTools(user) ? "/library/eras" : undefined} />
        <div className="library-results-header"><p className="result-summary" role="status">{fr ? `${matches.length} fiche${matches.length === 1 ? "" : "s"}` : `${matches.length} ${matches.length === 1 ? "entry" : "entries"}`}</p>
          <ProblemSortControl value={filters.sort} defaultValue="alphabetical" options={sortOptions} label={fr ? "Trier :" : "Sort:"} ariaLabel={fr ? "Trier les mathématiciens" : "Sort mathematicians"} />
        </div>
        {selected.length > 0 && <div className="library-person-grid">
          {selected.map(match => {
            const entry = rowById.get(match.person.id);
            const translation = entry?.translations.find(t => t.language === match.translation.language);
            if (!entry || !translation) return null;
            const href = `/library/mathematicians/${entry.slug}?lang=${translation.language}&returnTo=${encodeURIComponent(returnTo)}`;
            const era = match.period ? libraryEraOfPeriod(eras, match.period.from, match.period.to) : null;
            const status = entry.needsReviewAfterEdit && entry.status === "PUBLISHED" ? "PENDING_REVIEW" : entry.status;
            return <article className="library-person-card" key={entry.id} style={libraryEraStyle(era)}>
              <div className="library-person-card-portrait">
                <LibraryPersonPortrait name={translation.displayName} portraitUrl={entry.portraitUrl} crop={entry.portraitCrop} era={era} />
                {entry.portraitUrl && <PortraitSource credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} details={entry.portraitDetails} locale={locale} />}
                {(entry.status !== "PUBLISHED" || entry.needsReviewAfterEdit) && <span className="library-person-card-status"><LibraryStatusBadge status={status} locale={locale} /></span>}
              </div>
              <div className="library-person-card-body">
                {entry.lifespan && <p className="library-person-card-dates">{entry.lifespan}</p>}
                <h2><Link className="library-card-link" href={href as never}>{translation.displayName}</Link><ContentLanguageFallback language={translation.language} expectedLanguage={locale} /></h2>
                {translation.teaser && <p className="library-excerpt"><AsyncMarkdownInline markdown={translation.teaser} /></p>}
                {era && <p className="library-person-card-era">{era.name[locale]}</p>}
              </div>
            </article>;
          })}
        </div>}
        {!matches.length && <LibraryEmptyState>{fr ? "Aucune fiche ne correspond à ces filtres." : "No entries match these filters."} <Link href="/library/mathematicians">{fr ? "Réinitialiser" : "Reset"}</Link></LibraryEmptyState>}
        <LibraryPagination pathname="/library/mathematicians" query={activeQuery} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
      </section>
    </div>
  </ForestPageLayout>;
}
