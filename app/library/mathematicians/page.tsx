import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { FieldHelp } from "@/components/FieldHelp";
import { PortraitImage } from "@/components/library/PortraitImage";
import { PortraitSource } from "@/components/library/PortraitSource";
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
import { visibleLibraryEntryWhere } from "@/lib/library-queries";
import { hasTrustedPrivileges, isVerifiedContributor } from "@/lib/permissions";
import { browserValue, filterMathematicians, mathematiciansHref, parseMathematicianFilters, type BrowserQuery } from "@/lib/mathematician-browser";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

export default async function LibraryMathematiciansPage({ searchParams }: { searchParams: Promise<BrowserQuery> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const fr = locale === "fr", currentYear = new Date().getFullYear();
  const filters = parseMathematicianFilters(query, locale, currentYear);
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
  return <ForestPageLayout className="mathematician-browser" title={copy.mathematicians} heroImage="/art/birch-grove.jpg">
    <LibraryTabs active="mathematicians" locale={locale} />
    <div className="problems-workspace">
      <aside className="problems-filter-panel" aria-label={fr ? "Filtres des mathématiciens" : "Mathematician filters"}>
        <LiveSearchForm key={locale} className="problem-filter-form" resetLabel={fr ? "Réinitialiser les filtres" : "Reset filters"} updatingLabel={fr ? "Actualisation des résultats" : "Updating results"}>
          <label className="problem-filter-search"><span>{fr ? "Rechercher un mathématicien" : "Search for a mathematician"}</span><input name="q" defaultValue={filters.q} /></label>
          <MathematicianPeriodFilter locale={locale} currentYear={currentYear} initialEra={filters.era} initialPeriod={filters.period} />
          <div className="problem-filter-section"><fieldset className="problem-language-filter"><legend>{fr ? "Langues" : "Languages"}</legend>
            <input type="hidden" name="languagesSet" value="1" />
            {(["fr", "en"] as const).map(language => <label key={language}><input name="language" type="checkbox" value={language} defaultChecked={filters.languages.includes(language)} /><span>{language === "fr" ? "Français" : "English"}</span></label>)}
          </fieldset></div>
          <div className="problem-filter-section"><fieldset className="problem-language-filter"><legend>Contribution <FieldHelp text={fr ? "Retrouvez les fiches à relire ou les ébauches. Cocher les deux affiche celles qui répondent à au moins un de ces critères. Les droits d’accès restent applicables." : "Find entries awaiting review or stubs. Selecting both matches either condition. Access permissions still apply."} /></legend>
            <label><input type="checkbox" name="review" value="1" defaultChecked={filters.review} /><span>{fr ? "À relire" : "Awaiting review"}</span></label>
            <label><input type="checkbox" name="stub" value="1" defaultChecked={filters.stub} /><span>{fr ? "Ébauches" : "Stubs"}</span></label>
          </fieldset></div>
          {filters.sort !== "alphabetical" && <input type="hidden" name="sort" value={filters.sort} />}
          <noscript><button type="submit">{fr ? "Rechercher" : "Search"}</button></noscript>
        </LiveSearchForm>
      </aside>
      <section className="problems-ledger" aria-label={copy.mathematicians}>
        <div className="problems-ledger-header"><p className="result-summary" role="status">{fr ? `${matches.length} fiche${matches.length === 1 ? "" : "s"}` : `${matches.length} ${matches.length === 1 ? "entry" : "entries"}`}</p>
          <ProblemSortControl value={filters.sort} defaultValue="alphabetical" options={sortOptions} label={fr ? "Trier :" : "Sort:"} ariaLabel={fr ? "Trier les mathématiciens" : "Sort mathematicians"} />
        </div>
        {(canAdd || selected.length > 0) && <div className="library-card-grid library-mathematician-grid">
          {canAdd && <Link className="library-card library-add-mathematician" href="/library/mathematicians/new"><Plus size={72} strokeWidth={1.5} aria-hidden="true" /><span>{copy.addMathematician}</span></Link>}
          {selected.map(match => {
            const entry = rowById.get(match.person.id);
            const translation = entry?.translations.find(t => t.language === match.translation.language);
            if (!entry || !translation) return null;
            return <article className="library-card library-person-card" key={entry.id}>
              {entry.portraitUrl && <div className="library-card-image library-mathematician-portrait"><PortraitImage src={entry.portraitUrl} alt={entry.imageAlt ?? translation.displayName} crop={entry.portraitCrop} /><PortraitSource credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} details={entry.portraitDetails} locale={locale} /></div>}
              <div className="library-card-body"><div className="library-card-heading"><h2><Link href={`/library/mathematicians/${entry.slug}?lang=${translation.language}&returnTo=${encodeURIComponent(returnTo)}`}>{translation.displayName}</Link><ContentLanguageFallback language={translation.language} expectedLanguage={locale} /></h2>
                {(entry.status !== "PUBLISHED" || entry.needsReviewAfterEdit) && <LibraryStatusBadge status={entry.needsReviewAfterEdit && entry.status === "PUBLISHED" ? "PENDING_REVIEW" : entry.status} locale={locale} />}
              </div><p className="library-card-meta">{entry.lifespan}</p>{translation.teaser && <p><AsyncMarkdownInline markdown={translation.teaser} /></p>}</div>
            </article>;
          })}
        </div>}
        {!matches.length && <LibraryEmptyState>{fr ? "Aucune fiche ne correspond à ces filtres." : "No entries match these filters."} <Link href="/library/mathematicians">{fr ? "Réinitialiser" : "Reset"}</Link></LibraryEmptyState>}
        <LibraryPagination pathname="/library/mathematicians" query={activeQuery} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
      </section>
    </div>
  </ForestPageLayout>;
}
