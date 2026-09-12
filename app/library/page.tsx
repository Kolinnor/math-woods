import { LibraryStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, Search, Settings2 } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { PortraitImage } from "@/components/library/PortraitImage";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { matchingReferenceIds } from "@/lib/reference-search";
import { PortraitSource } from "@/components/library/PortraitSource";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { updateLibraryHomepageAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { historyEraLabel, referenceTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation, searchMathematicians } from "@/lib/library-queries";
import { canUseAdminTools } from "@/lib/permissions";
import { libraryCatalogueHref, libraryReferenceSummary } from "@/lib/library-browser";
import { ImageCredit } from "@/components/library/ImageCredit";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [locale, user, query] = await Promise.all([
    getInterfaceLocale(),
    requireAdmin(),
    searchParams
  ]);
  const q = query.q?.trim().slice(0, 160);
  const isAdmin = Boolean(user && canUseAdminTools(user));
  const selection = await prisma.libraryHomepageSelection.findUnique({
    where: { id: 1 },
    include: {
      milestone: { include: { translations: true } },
      mathematician: { include: { translations: true } },
      reference: { include: { translations: true } }
    }
  });
  const [milestones, mathematicians, references] = isAdmin
    ? await Promise.all([
        prisma.historyMilestone.findMany({ where: { status: LibraryStatus.PUBLISHED }, include: { translations: true }, orderBy: { sortYear: "asc" } }),
        prisma.mathematician.findMany({ where: { status: LibraryStatus.PUBLISHED }, include: { translations: true }, orderBy: { name: "asc" } }),
        prisma.libraryReference.findMany({ where: { status: LibraryStatus.PUBLISHED }, include: { translations: true }, orderBy: { canonicalTitle: "asc" } })
      ])
    : [[], [], []];
  const searchResults = q ? await searchLibrary(q, locale) : null;
  const copy = libraryCopy[locale];
  const validMilestone = selection?.milestone?.status === LibraryStatus.PUBLISHED ? selection.milestone : null;
  const validMathematician = selection?.mathematician?.status === LibraryStatus.PUBLISHED ? selection.mathematician : null;
  const validReference = selection?.reference?.status === LibraryStatus.PUBLISHED ? selection.reference : null;
  const [fallbackMilestone, fallbackMathematician, fallbackReference] = await Promise.all([
    validMilestone ? null : (isAdmin ? milestones[0] ?? null : prisma.historyMilestone.findFirst({ where: { status: LibraryStatus.PUBLISHED }, include: { translations: true }, orderBy: { id: "asc" } })),
    validMathematician ? null : (isAdmin ? mathematicians[0] ?? null : prisma.mathematician.findFirst({ where: { status: LibraryStatus.PUBLISHED }, include: { translations: true }, orderBy: { id: "asc" } })),
    validReference ? null : (isAdmin ? references[0] ?? null : prisma.libraryReference.findFirst({ where: { status: LibraryStatus.PUBLISHED }, include: { translations: true }, orderBy: { id: "asc" } }))
  ]);
  const selectedMilestone = validMilestone ?? fallbackMilestone;
  const selectedMathematician = validMathematician ?? fallbackMathematician;
  const selectedReference = validReference ?? fallbackReference;
  const milestoneTranslation = selectedMilestone ? localizedTranslation(selectedMilestone.translations, locale) : null;
  const mathematicianTranslation = selectedMathematician ? localizedTranslation(selectedMathematician.translations, locale) : null;
  const referenceTranslation = selectedReference ? localizedTranslation(selectedReference.translations, locale) : null;

  const adminPanel = isAdmin ? (
    <details className="library-curation-panel">
      <summary><Settings2 size={16} aria-hidden="true" />{locale === "fr" ? "Sélection de l’accueil" : "Homepage selection"}</summary>
      <form action={updateLibraryHomepageAction}>
        <label><span>{copy.history}</span><select name="milestoneId" defaultValue={selection?.milestoneId ?? ""}><option value="">—</option>{milestones.map((item) => <option key={item.id} value={item.id}>{localizedTranslation(item.translations, locale)?.title ?? item.slug}</option>)}</select></label>
        <label><span>{copy.mathematicians}</span><select name="mathematicianId" defaultValue={selection?.mathematicianId ?? ""}><option value="">—</option>{mathematicians.map((item) => <option key={item.id} value={item.id}>{localizedTranslation(item.translations, locale)?.displayName ?? item.name}</option>)}</select></label>
        <label><span>{copy.references}</span><select name="referenceId" defaultValue={selection?.referenceId ?? ""}><option value="">—</option>{references.map((item) => <option key={item.id} value={item.id}>{item.canonicalTitle}</option>)}</select></label>
        <button className="primary" type="submit">{locale === "fr" ? "Enregistrer" : "Save"}</button>
      </form>
    </details>
  ) : undefined;

  return (
    <ForestPageLayout
      className="library-page"
      title={copy.title}
      description={copy.description}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
    >
      <div className="library-overview-navigation"><LibraryTabs active="overview" locale={locale} />{adminPanel}</div>
      <form className="library-global-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" name="q" defaultValue={q} maxLength={160} placeholder={locale === "fr" ? "Rechercher dans toute la bibliothèque" : "Search the entire library"} aria-label={locale === "fr" ? "Rechercher dans toute la bibliothèque" : "Search the entire library"} />
        <button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button>
      </form>
      {searchResults && <section className="library-global-results" aria-live="polite">
        <h2>{locale === "fr" ? `Résultats pour « ${q} »` : `Results for “${q}”`}</h2>
        {searchResults.some(group => group.items.length) ? <div className="library-search-groups">{searchResults.map(group => <section key={group.path}><h3>{group.label}</h3>{group.items.length ? <><ul>{group.items.slice(0, 6).map(result => <li key={result.href}><Link href={result.href as never}>{result.title}</Link>{result.language && <ContentLanguageFallback language={result.language} expectedLanguage={locale} />}</li>)}</ul><Link className="library-more-link" href={libraryCatalogueHref(group.path, { q, ...(group.path.endsWith("mathematicians") ? { languagesSet: "1", language: ["fr", "en"] } : {}) }) as never}>{locale === "fr" ? "Voir tous les résultats" : "View all results"}<ArrowRight size={15} aria-hidden="true" /></Link>{group.items.length > 6 && <p className="muted">{locale === "fr" ? "Les 6 premiers résultats sont affichés." : "Showing the first 6 results."}</p>}</> : <p className="muted">{locale === "fr" ? "Aucun résultat dans cette rubrique." : "No results in this section."}</p>}</section>)}</div> : <LibraryEmptyState><span>{locale === "fr" ? "Aucune fiche ne correspond à cette recherche." : "No entries match this search."} <Link href="/library">{locale === "fr" ? "Effacer la recherche" : "Clear search"}</Link></span></LibraryEmptyState>}
      </section>}
      {!q && <div className="library-feature-grid">
        <section className="library-feature library-feature-history">
          <p className="library-kicker">{copy.featuredHistory}</p>
          {selectedMilestone && milestoneTranslation ? (
            <>
              {selectedMilestone.imageUrl && <div className="library-feature-history-image"><Link href={`/library/history/${selectedMilestone.slug}`} tabIndex={-1} aria-hidden="true"><img src={selectedMilestone.imageUrl} alt="" /></Link><ImageCredit credit={selectedMilestone.imageCredit} creditUrl={selectedMilestone.imageCreditUrl} license={selectedMilestone.imageLicense} label={copy.imageCredit} /></div>}
              <p className="library-feature-meta">{milestoneTranslation.yearLabel} · {historyEraLabel(selectedMilestone.era, locale)}</p>
              <h2><Link href={`/library/history/${selectedMilestone.slug}`}>{milestoneTranslation.title}</Link><ContentLanguageFallback language={milestoneTranslation.language} expectedLanguage={locale} /></h2>
              <div className="prose-math library-excerpt" dangerouslySetInnerHTML={{ __html: milestoneTranslation.summaryHtml }} />
              <Link className="library-more-link" href="/library/history">{locale === "fr" ? "Explorer l’histoire" : "Explore history"}<ArrowRight size={15} aria-hidden="true" /></Link>
            </>
          ) : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
        </section>

        <section className="library-feature library-feature-person">
          <p className="library-kicker">{copy.featuredMathematician}</p>
          {selectedMathematician && mathematicianTranslation ? (
            <div className="library-person-feature">
              {selectedMathematician.portraitUrl && <div className="library-feature-image"><PortraitImage src={selectedMathematician.portraitUrl} alt={selectedMathematician.imageAlt ?? mathematicianTranslation.displayName} crop={selectedMathematician.portraitCrop} /><PortraitSource credit={selectedMathematician.imageCredit} creditUrl={selectedMathematician.imageCreditUrl} license={selectedMathematician.imageLicense} details={selectedMathematician.portraitDetails} locale={locale} /></div>}
              <div><h2><Link href={`/library/mathematicians/${selectedMathematician.slug}`}>{mathematicianTranslation.displayName}</Link><ContentLanguageFallback language={mathematicianTranslation.language} expectedLanguage={locale} /></h2><p className="library-card-meta">{selectedMathematician.lifespan}</p><p className="library-excerpt"><AsyncMarkdownInline markdown={mathematicianTranslation.teaser} /></p></div>
            </div>
          ) : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
          <Link className="library-more-link" href="/library/mathematicians">{locale === "fr" ? "Découvrir les mathématiciens" : "Discover mathematicians"}<ArrowRight size={15} aria-hidden="true" /></Link>
        </section>

        <section className="library-feature library-feature-reference">
          <p className="library-kicker">{copy.featuredReference}</p>
          {selectedReference ? (
            <>
              <p className="library-feature-meta">{referenceTypeLabel(selectedReference.referenceType, locale)}</p>
              <h2><Link href={`/library/references/${selectedReference.slug}`}>{referenceTranslation?.displayTitle ?? selectedReference.canonicalTitle}</Link>{referenceTranslation && <ContentLanguageFallback language={referenceTranslation.language} expectedLanguage={locale} />}</h2>
              {libraryReferenceSummary(selectedReference) && <p className="library-citation">{libraryReferenceSummary(selectedReference)}</p>}
              {referenceTranslation?.descriptionHtml && <div className="prose-math library-excerpt" dangerouslySetInnerHTML={{ __html: referenceTranslation.descriptionHtml }} />}
            </>
          ) : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
          <Link className="library-more-link" href="/library/references">{locale === "fr" ? "Parcourir les références" : "Browse references"}<ArrowRight size={15} aria-hidden="true" /></Link>
        </section>
      </div>}
    </ForestPageLayout>
  );
}

async function searchLibrary(q: string, locale: "en" | "fr") {
  const [milestones, mathematicians, references] = await Promise.all([
    prisma.historyMilestone.findMany({
      where: { status: LibraryStatus.PUBLISHED, translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { summaryMarkdown: { contains: q, mode: "insensitive" } }, { yearLabel: { contains: q, mode: "insensitive" } }] } } },
      include: { translations: true },
      orderBy: { sortYear: "asc" },
      take: 7
    }),
    searchMathematicians(q, locale).then(people => people.slice(0, 7)),
    matchingReferenceIds(prisma, q, { includeDescriptions: true }).then(ids => prisma.libraryReference.findMany({
      where: {
        status: LibraryStatus.PUBLISHED,
        searchable: true, mergedIntoId: null,
        id: { in: ids }
      },
      include: { translations: true },
      orderBy: { canonicalTitle: "asc" },
      take: 7
    }))
  ]);
  return [
    { path: "/library/history", label: locale === "fr" ? "Histoire" : "History", items: milestones.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/history/${entry.slug}`, title: translation?.title ?? entry.slug, language: translation?.language ?? null }; }) },
    { path: "/library/mathematicians", label: locale === "fr" ? "Mathématiciens" : "Mathematicians", items: mathematicians.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/mathematicians/${entry.slug}`, title: translation?.displayName ?? entry.name, language: translation?.language ?? null }; }) },
    { path: "/library/references", label: locale === "fr" ? "Références" : "References", items: references.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/references/${entry.slug}`, title: translation?.displayTitle ?? entry.canonicalTitle, language: translation?.language ?? null }; }) }
  ];
}
