import { LibraryStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, Search, Settings2, UsersRound } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { matchingReferenceIds } from "@/lib/reference-search";
import { PortraitSource } from "@/components/library/PortraitSource";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryFrise } from "@/components/library/LibraryFrise";
import { LibraryEntryPicker } from "@/components/library/LibraryEntryPicker";
import { libraryFriseCandidates, selectFriseOverview } from "@/lib/library-frise";
import { LibraryMilestoneTypeIcon, LibraryReferenceTypeIcon } from "@/components/library/LibraryIcons";
import { LibraryPersonPortrait } from "@/components/library/LibraryPersonPortrait";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { updateLibraryHomepageAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { milestoneTypeLabel, referenceTypeLabel } from "@/lib/library";
import { libraryCatalogueHref, libraryReferenceSummary } from "@/lib/library-browser";
import { libraryCopy } from "@/lib/library-copy";
import { libraryDateLabel, libraryEraOfPeriod, libraryEraStyle, libraryPlural } from "@/lib/library-display";
import { getLibraryEras } from "@/lib/library-eras";
import { localizedTranslation, searchMathematicians } from "@/lib/library-queries";
import { mathematicianPeriod } from "@/lib/mathematician-browser";
import { canUseAdminTools, hasTrustedPrivileges } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PUBLISHED = LibraryStatus.PUBLISHED;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [locale, user, query, eras] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams, getLibraryEras()]);
  const q = query.q?.trim().slice(0, 160);
  const fr = locale === "fr";
  const copy = libraryCopy[locale];
  const isAdmin = Boolean(user && canUseAdminTools(user));
  const reviewer = hasTrustedPrivileges(user.role);
  const currentYear = new Date().getFullYear();

  const [selection, candidates, recentMilestones, recentPeople, recentReferences, pending, searchResults] = await Promise.all([
    prisma.libraryHomepageSelection.findUnique({
      where: { id: 1 },
      include: { milestone: { include: { translations: true } }, mathematician: { include: { translations: true } }, reference: { include: { translations: true } } }
    }),
    libraryFriseCandidates(locale),
    prisma.historyMilestone.findMany({ where: { status: PUBLISHED }, select: { id: true, slug: true, updatedAt: true, milestoneType: true, translations: { select: { language: true, title: true } } }, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.mathematician.findMany({ where: { status: PUBLISHED }, select: { id: true, slug: true, name: true, lifespan: true, updatedAt: true, periodStartYear: true, periodEndYear: true, portraitUrl: true, portraitCrop: true, translations: { select: { language: true, displayName: true } } }, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.libraryReference.findMany({ where: { status: PUBLISHED, searchable: true, mergedIntoId: null }, select: { id: true, slug: true, updatedAt: true, referenceType: true, canonicalTitle: true, translations: { select: { language: true, displayTitle: true } } }, orderBy: { updatedAt: "desc" }, take: 6 }),
    reviewer ? pendingReviewCount() : 0,
    q ? searchLibrary(q, locale) : null
  ]);

  // Curated entries, or else the first published entry of each kind (preferably a complete one).
  const validMilestone = selection?.milestone?.status === PUBLISHED ? selection.milestone : null;
  const validMathematician = selection?.mathematician?.status === PUBLISHED ? selection.mathematician : null;
  const validReference = selection?.reference?.status === PUBLISHED ? selection.reference : null;
  const [selectedMilestone, selectedMathematician, selectedReference] = await Promise.all([
    validMilestone ?? prisma.historyMilestone.findFirst({ where: { status: PUBLISHED, translations: { some: { language: locale, summaryMarkdown: { not: "" } } } }, include: { translations: true }, orderBy: { id: "asc" } })
      .then(milestone => milestone ?? prisma.historyMilestone.findFirst({ where: { status: PUBLISHED }, include: { translations: true }, orderBy: { id: "asc" } })),
    validMathematician ?? prisma.mathematician.findFirst({ where: { status: PUBLISHED, portraitUrl: { not: null }, translations: { some: { language: locale, teaser: { not: "" } } } }, include: { translations: true }, orderBy: { id: "asc" } })
      .then(person => person ?? prisma.mathematician.findFirst({ where: { status: PUBLISHED }, include: { translations: true }, orderBy: { id: "asc" } })),
    validReference ?? prisma.libraryReference.findFirst({ where: { status: PUBLISHED, searchable: true, mergedIntoId: null, translations: { some: { language: locale, descriptionMarkdown: { not: "" } } } }, include: { translations: true }, orderBy: { id: "asc" } })
      .then(reference => reference ?? prisma.libraryReference.findFirst({ where: { status: PUBLISHED, searchable: true, mergedIntoId: null }, include: { translations: true }, orderBy: { id: "asc" } }))
  ]);
  const milestoneTranslation = selectedMilestone ? localizedTranslation(selectedMilestone.translations, locale) : null;
  const mathematicianTranslation = selectedMathematician ? localizedTranslation(selectedMathematician.translations, locale) : null;
  const referenceTranslation = selectedReference ? localizedTranslation(selectedReference.translations, locale) : null;
  const selectedPeriod = selectedMathematician ? mathematicianPeriod(selectedMathematician, currentYear) : null;

  const personName = (person: { name: string; translations: { language: string; displayName: string }[] }) => localizedTranslation(person.translations, locale)?.displayName ?? person.name;
  const eraOfPerson = (person: { lifespan: string; periodStartYear: number | null; periodEndYear: number | null }) => {
    const period = mathematicianPeriod(person, currentYear);
    return period ? libraryEraOfPeriod(eras, period.from, period.to) : null;
  };

  // The timeline: a selection of periods, events and lives in every era, and the size of each era.
  const frise = selectFriseOverview(candidates, eras);
  const totalPeople = candidates.people.length;
  const totalMilestones = candidates.milestones.length;

  const dateFormat = new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "short" });
  const recent = [
    ...recentMilestones.map(item => ({ key: `h-${item.id}`, section: copy.history, href: `/library/history/${item.slug}`, title: localizedTranslation(item.translations, locale)?.title ?? item.slug, label: milestoneTypeLabel(item.milestoneType, locale), updatedAt: item.updatedAt,
      visual: <span className="library-type-icon" data-kind="history"><LibraryMilestoneTypeIcon type={item.milestoneType} size={17} /></span> })),
    ...recentPeople.map(item => ({ key: `m-${item.id}`, section: copy.mathematicians, href: `/library/mathematicians/${item.slug}`, title: personName(item), label: item.lifespan, updatedAt: item.updatedAt,
      visual: <span className="library-thumb"><LibraryPersonPortrait variant="thumb" name={personName(item)} portraitUrl={item.portraitUrl} crop={item.portraitCrop} era={eraOfPerson(item)} /></span> })),
    ...recentReferences.map(item => ({ key: `r-${item.id}`, section: copy.references, href: `/library/references/${item.slug}`, title: localizedTranslation(item.translations, locale)?.displayTitle ?? item.canonicalTitle, label: referenceTypeLabel(item.referenceType, locale), updatedAt: item.updatedAt,
      visual: <span className="library-type-icon"><LibraryReferenceTypeIcon type={item.referenceType} size={17} /></span> }))
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);

  const curation = isAdmin ? (
    <details className="library-curation-panel">
      <summary><Settings2 size={15} aria-hidden="true" />{fr ? "Modifier la sélection" : "Edit the selection"}</summary>
      <form action={updateLibraryHomepageAction}>
        <p>{fr ? "Choisissez les fiches mises à la une. Sans choix, une fiche publiée complète est affichée." : "Choose the featured entries. Without a choice, a complete published entry is shown."}</p>
        <LibraryEntryPicker name="mathematicianId" kind="mathematician" locale={locale} label={copy.mathematicians}
          initial={validMathematician ? { id: validMathematician.id, label: personName(validMathematician), detail: validMathematician.lifespan } : null} />
        <LibraryEntryPicker name="milestoneId" kind="milestone" locale={locale} label={copy.history}
          initial={validMilestone ? { id: validMilestone.id, label: localizedTranslation(validMilestone.translations, locale)?.title ?? validMilestone.slug, detail: localizedTranslation(validMilestone.translations, locale)?.yearLabel } : null} />
        <LibraryEntryPicker name="referenceId" kind="reference" locale={locale} label={copy.references}
          initial={validReference ? { id: validReference.id, label: localizedTranslation(validReference.translations, locale)?.displayTitle ?? validReference.canonicalTitle, detail: libraryReferenceSummary(validReference) } : null} />
        <button className="primary" type="submit">{fr ? "Enregistrer" : "Save"}</button>
      </form>
    </details>
  ) : null;

  return (
    <ForestPageLayout className="library-home" title={copy.title} description={copy.description} heroImage="/art/birch-grove.jpg" heroAlt={fr ? "Un bois de bouleaux ensoleillé" : "A sunlit birch grove"}>
      <LibraryTabs active="overview" locale={locale} />

      <form className="library-global-search" role="search">
        <Search size={19} aria-hidden="true" />
        <input type="search" name="q" defaultValue={q} maxLength={160} placeholder={fr ? "Un nom, une œuvre, une date…" : "A name, a work, a date…"} aria-label={fr ? "Rechercher dans toute la bibliothèque" : "Search the entire library"} />
        <button className="primary" type="submit" aria-label={fr ? "Rechercher" : "Search"}><span>{fr ? "Rechercher" : "Search"}</span><ArrowRight size={18} aria-hidden="true" /></button>
      </form>

      {searchResults && <section className="library-global-results" aria-live="polite">
        <div className="library-section-heading"><h2>{fr ? `Résultats pour « ${q} »` : `Results for “${q}”`}</h2><Link className="library-more-link" href="/library">{fr ? "Effacer la recherche" : "Clear search"}</Link></div>
        {searchResults.some(group => group.items.length) ? <div className="library-search-groups">{searchResults.map(group => <section key={group.path} data-room={group.room}>
          <h3>{group.room === "history" ? <Clock3 size={17} aria-hidden="true" /> : group.room === "people" ? <UsersRound size={17} aria-hidden="true" /> : <BookOpen size={17} aria-hidden="true" />}{group.label}<span className="library-entry-section-count">{group.items.length > 6 ? "6+" : group.items.length}</span></h3>
          {group.items.length ? <>
            <ul>{group.items.slice(0, 6).map(result => <li key={result.href}><Link href={result.href as never}>{result.title}</Link>{result.language && <ContentLanguageFallback language={result.language} expectedLanguage={locale} />}</li>)}</ul>
            <Link className="library-more-link" href={libraryCatalogueHref(group.path, { q, ...(group.path.endsWith("mathematicians") ? { languagesSet: "1", language: ["fr", "en"] } : {}) }) as never}>{fr ? "Voir tous les résultats" : "View all results"}<ArrowRight size={15} aria-hidden="true" /></Link>
          </> : <p className="muted">{fr ? "Aucun résultat dans cette rubrique." : "No results in this section."}</p>}
        </section>)}</div> : <LibraryEmptyState><span>{fr ? "Aucune fiche ne correspond à cette recherche." : "No entries match this search."} <Link href="/library">{fr ? "Effacer la recherche" : "Clear search"}</Link></span></LibraryEmptyState>}
      </section>}

      {!q && <>
        <section className="library-home-section library-frise-section">
          <div className="library-section-heading">
            <div><h2>{fr ? "La frise des mathématiques" : "The timeline of mathematics"}</h2>
              <p>{fr ? `Une sélection parmi ${libraryPlural(totalMilestones, "repère", "repères")} et ${libraryPlural(totalPeople, "mathématicien", "mathématiciens")}, époque par époque.` : `A selection from ${libraryPlural(totalMilestones, "milestone", "milestones")} and ${libraryPlural(totalPeople, "mathematician", "mathematicians")}, era by era.`}</p></div>
            <div className="library-section-actions">
              {isAdmin && <Link className="library-quiet-link" href="/library/eras"><Settings2 size={15} aria-hidden="true" />{fr ? "Modifier les époques" : "Edit the eras"}</Link>}
              <Link className="library-more-link" href="/library/history">{fr ? "Parcourir l’histoire" : "Browse the history"}<ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
          <LibraryFrise locale={locale} eras={eras} milestones={frise.milestones} people={frise.people} totals={frise.totals} />
          <ul className="library-frise-legend" aria-label={fr ? "Légende" : "Legend"}>
            <li><span data-mark="event" aria-hidden="true" />{fr ? "Événement, découverte, publication" : "Event, discovery, publication"}</li>
            <li><span data-mark="period" aria-hidden="true" />{fr ? "Période" : "Period"}</li>
            <li><span data-mark="life" aria-hidden="true" />{fr ? "Vie d’un mathématicien" : "A mathematician’s life"}</li>
          </ul>
          <p className="library-era-zoom-note">{fr
            ? "Chaque époque occupe la même largeur : l’échelle du temps change donc d’une colonne à l’autre. Une fiche peut traverser plusieurs époques et être comptée dans chacune."
            : "Each era has the same width, so the time scale changes between columns. An entry may span several eras and be counted in each."}</p>
        </section>

        <section className="library-home-section">
          <div className="library-section-heading">
            <div><h2>{fr ? "À la une" : "Featured"}</h2><p>{fr ? "Une personne, un moment et une lecture." : "A person, a moment and a reading."}</p></div>
            {curation && <div className="library-section-actions">{curation}</div>}
          </div>
          <div className="library-spotlight">
            <article className="library-spotlight-card library-spotlight-person" style={libraryEraStyle(selectedPeriod ? libraryEraOfPeriod(eras, selectedPeriod.from, selectedPeriod.to) : null)}>
              {selectedMathematician && mathematicianTranslation ? <>
                <div className="library-spotlight-portrait">
                  <LibraryPersonPortrait name={mathematicianTranslation.displayName} portraitUrl={selectedMathematician.portraitUrl} crop={selectedMathematician.portraitCrop} alt={selectedMathematician.imageAlt ?? mathematicianTranslation.displayName} era={selectedPeriod ? libraryEraOfPeriod(eras, selectedPeriod.from, selectedPeriod.to) : null} />
                  {selectedMathematician.portraitUrl && <PortraitSource credit={selectedMathematician.imageCredit} creditUrl={selectedMathematician.imageCreditUrl} license={selectedMathematician.imageLicense} details={selectedMathematician.portraitDetails} locale={locale} />}
                </div>
                <div className="library-spotlight-body">
                  <p className="library-kicker">{copy.featuredMathematician}</p>
                  <h3><Link className="library-card-link" href={`/library/mathematicians/${selectedMathematician.slug}` as never}>{mathematicianTranslation.displayName}</Link><ContentLanguageFallback language={mathematicianTranslation.language} expectedLanguage={locale} /></h3>
                  {selectedMathematician.lifespan && <p className="library-spotlight-meta">{selectedMathematician.lifespan}</p>}
                  {mathematicianTranslation.teaser && <p className="library-excerpt"><AsyncMarkdownInline markdown={mathematicianTranslation.teaser} /></p>}
                </div>
              </> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
            </article>
            <article className="library-spotlight-card library-spotlight-milestone">
              {selectedMilestone && milestoneTranslation ? <>
                {selectedMilestone.imageUrl && <div className="library-spotlight-image"><img src={selectedMilestone.imageUrl} alt="" /><ImageCredit credit={selectedMilestone.imageCredit} creditUrl={selectedMilestone.imageCreditUrl} license={selectedMilestone.imageLicense} label={copy.imageCredit} /></div>}
                <div className="library-spotlight-body">
                  <p className="library-kicker">{copy.featuredHistory}</p>
                  <p className="library-spotlight-date">{libraryDateLabel(milestoneTranslation.yearLabel)}</p>
                  <h3><Link className="library-card-link" href={`/library/history/${selectedMilestone.slug}` as never}>{milestoneTranslation.title}</Link><ContentLanguageFallback language={milestoneTranslation.language} expectedLanguage={locale} /></h3>
                  {milestoneTranslation.summaryHtml.trim() && <div className="prose-math library-excerpt" dangerouslySetInnerHTML={{ __html: milestoneTranslation.summaryHtml }} />}
                </div>
              </> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
            </article>
            <article className="library-spotlight-card library-spotlight-reference">
              {selectedReference ? <>
                <div className="library-spotlight-body">
                  <p className="library-kicker">{copy.featuredReference}</p>
                  <p className="library-spotlight-type"><LibraryReferenceTypeIcon type={selectedReference.referenceType} size={15} />{referenceTypeLabel(selectedReference.referenceType, locale)}</p>
                  <h3><Link className="library-card-link" href={`/library/references/${selectedReference.slug}` as never}>{referenceTranslation?.displayTitle ?? selectedReference.canonicalTitle}</Link>{referenceTranslation && <ContentLanguageFallback language={referenceTranslation.language} expectedLanguage={locale} />}</h3>
                  {libraryReferenceSummary(selectedReference) && <p className="library-spotlight-meta">{libraryReferenceSummary(selectedReference)}</p>}
                  {referenceTranslation?.descriptionHtml.trim() && <div className="prose-math library-excerpt" dangerouslySetInnerHTML={{ __html: referenceTranslation.descriptionHtml }} />}
                </div>
              </> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
            </article>
          </div>
        </section>

        {recent.length > 0 && <section className="library-home-section">
          <div className="library-section-heading">
            <div><h2>{fr ? "Récemment enrichi" : "Recently updated"}</h2><p>{fr ? "Les dernières fiches publiées ou modifiées." : "The latest published or edited entries."}</p></div>
            {pending > 0 && <div className="library-section-actions"><Link className="library-pending-link" href="/library/contribute">{fr ? `${libraryPlural(pending, "fiche", "fiches")} à relire` : `${libraryPlural(pending, "entry", "entries")} to review`}<ArrowRight size={15} aria-hidden="true" /></Link></div>}
          </div>
          <ol className="library-link-list library-recent-list">{recent.map(entry => <li key={entry.key} className="library-link-item">
            {entry.visual}
            <div><Link className="library-link-title" href={entry.href as never}>{entry.title}</Link><small className="library-link-meta">{[entry.section, entry.label].filter(Boolean).join(" · ")}</small></div>
            <time className="library-recent-date" dateTime={entry.updatedAt.toISOString()}>{dateFormat.format(entry.updatedAt)}</time>
          </li>)}</ol>
        </section>}
      </>}
    </ForestPageLayout>
  );
}

/** Entries waiting for a review, as counted on the contribution page. */
async function pendingReviewCount() {
  const unreviewed = { OR: [{ status: LibraryStatus.PENDING_REVIEW }, { status: PUBLISHED, reviewedAt: null }] };
  const counts = await Promise.all([
    prisma.mathematician.count({ where: { OR: [{ status: LibraryStatus.PENDING_REVIEW }, { status: PUBLISHED, needsReviewAfterEdit: true }] } }),
    prisma.historyMilestone.count({ where: unreviewed }),
    prisma.libraryReference.count({ where: { ...unreviewed, mergedIntoId: null } })
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function searchLibrary(q: string, locale: "en" | "fr") {
  const [milestones, mathematicians, references] = await Promise.all([
    prisma.historyMilestone.findMany({
      where: { status: PUBLISHED, translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { summaryMarkdown: { contains: q, mode: "insensitive" } }, { yearLabel: { contains: q, mode: "insensitive" } }] } } },
      include: { translations: true },
      orderBy: { sortYear: "asc" },
      take: 7
    }),
    searchMathematicians(q, locale).then(people => people.slice(0, 7)),
    matchingReferenceIds(prisma, q, { includeDescriptions: true }).then(ids => prisma.libraryReference.findMany({
      where: { status: PUBLISHED, searchable: true, mergedIntoId: null, id: { in: ids } },
      include: { translations: true },
      orderBy: { canonicalTitle: "asc" },
      take: 7
    }))
  ]);
  return [
    { path: "/library/history", room: "history", label: locale === "fr" ? "Histoire" : "History", items: milestones.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/history/${entry.slug}`, title: translation?.title ?? entry.slug, language: translation?.language ?? null }; }) },
    { path: "/library/mathematicians", room: "people", label: locale === "fr" ? "Mathématiciens" : "Mathematicians", items: mathematicians.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/mathematicians/${entry.slug}`, title: translation?.displayName ?? entry.name, language: translation?.language ?? null }; }) },
    { path: "/library/references", room: "references", label: locale === "fr" ? "Références" : "References", items: references.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/references/${entry.slug}`, title: translation?.displayTitle ?? entry.canonicalTitle, language: translation?.language ?? null }; }) }
  ];
}
