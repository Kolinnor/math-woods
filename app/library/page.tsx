import { LibraryStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, Search, Settings2 } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { updateLibraryHomepageAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { formatLibraryReference, historyEraLabel, referenceTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation } from "@/lib/library-queries";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [locale, user, query] = await Promise.all([
    getInterfaceLocale(),
    requireAdmin(),
    searchParams
  ]);
  const q = query.q?.trim();
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
    <details className="panel library-curation-panel">
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
      sidebar={adminPanel}
    >
      <LibraryTabs active="overview" locale={locale} />
      <form className="library-global-search">
        <Search size={18} aria-hidden="true" />
        <input name="q" defaultValue={q} placeholder={locale === "fr" ? "Rechercher dans toute la bibliothèque" : "Search the entire library"} aria-label={locale === "fr" ? "Rechercher dans toute la bibliothèque" : "Search the entire library"} />
        <button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button>
      </form>
      {searchResults && <section className="library-global-results" aria-live="polite">
        <h2>{locale === "fr" ? `Résultats pour « ${q} »` : `Results for “${q}”`}</h2>
        {searchResults.length > 0 ? <div>{searchResults.map((result) => <Link href={result.href as never} key={result.href}><small>{result.kind}</small><strong>{result.title}</strong>{result.language && <ContentLanguageFallback language={result.language} expectedLanguage={locale} />}</Link>)}</div> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
      </section>}
      <div className="library-feature-grid">
        <section className="library-feature library-feature-history">
          <p className="library-kicker">{copy.featuredHistory}</p>
          {selectedMilestone && milestoneTranslation ? (
            <>
              <p className="library-feature-meta">{milestoneTranslation.yearLabel} · {historyEraLabel(selectedMilestone.era, locale)}</p>
              <h2><Link href={`/library/history/${selectedMilestone.slug}`}>{milestoneTranslation.title}</Link><ContentLanguageFallback language={milestoneTranslation.language} expectedLanguage={locale} /></h2>
              <div className="prose-math" dangerouslySetInnerHTML={{ __html: milestoneTranslation.summaryHtml }} />
              <Link className="library-more-link" href={`/library/history/${selectedMilestone.slug}`}>{copy.browseAll}<ArrowRight size={15} /></Link>
            </>
          ) : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
        </section>

        <section className="library-feature library-feature-person">
          <p className="library-kicker">{copy.featuredMathematician}</p>
          {selectedMathematician && mathematicianTranslation ? (
            <div className="library-person-feature">
              {selectedMathematician.portraitUrl && <div className="library-feature-image"><img src={selectedMathematician.portraitUrl} alt={selectedMathematician.imageAlt ?? mathematicianTranslation.displayName} /><ImageCredit credit={selectedMathematician.imageCredit} creditUrl={selectedMathematician.imageCreditUrl} license={selectedMathematician.imageLicense} label={copy.imageCredit} /></div>}
              <div><h2><Link href={`/library/mathematicians/${selectedMathematician.slug}`}>{mathematicianTranslation.displayName}</Link><ContentLanguageFallback language={mathematicianTranslation.language} expectedLanguage={locale} /></h2><p>{selectedMathematician.lifespan}</p><p>{mathematicianTranslation.teaser}</p></div>
            </div>
          ) : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
        </section>

        <section className="library-feature library-feature-reference">
          <p className="library-kicker">{copy.featuredReference}</p>
          {selectedReference ? (
            <>
              <p className="library-feature-meta">{referenceTypeLabel(selectedReference.referenceType, locale)}</p>
              <h2><Link href={`/library/references/${selectedReference.slug}`}>{referenceTranslation?.displayTitle ?? selectedReference.canonicalTitle}</Link>{referenceTranslation && <ContentLanguageFallback language={referenceTranslation.language} expectedLanguage={locale} />}</h2>
              <p className="library-citation">{formatLibraryReference(selectedReference)}</p>
              {referenceTranslation?.descriptionHtml && <div className="prose-math" dangerouslySetInnerHTML={{ __html: referenceTranslation.descriptionHtml }} />}
            </>
          ) : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
        </section>
      </div>
    </ForestPageLayout>
  );
}

async function searchLibrary(q: string, locale: "en" | "fr") {
  const [milestones, mathematicians, references] = await Promise.all([
    prisma.historyMilestone.findMany({
      where: { status: LibraryStatus.PUBLISHED, translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { summaryMarkdown: { contains: q, mode: "insensitive" } }] } } },
      include: { translations: true },
      orderBy: { sortYear: "asc" },
      take: 6
    }),
    prisma.mathematician.findMany({
      where: {
        status: LibraryStatus.PUBLISHED,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { translations: { some: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { teaser: { contains: q, mode: "insensitive" } }] } } }
        ]
      },
      include: { translations: true },
      orderBy: { name: "asc" },
      take: 6
    }),
    prisma.libraryReference.findMany({
      where: {
        status: LibraryStatus.PUBLISHED,
        OR: [
          { canonicalTitle: { contains: q, mode: "insensitive" } },
          { authors: { contains: q, mode: "insensitive" } },
          { publisher: { contains: q, mode: "insensitive" } },
          { translations: { some: { displayTitle: { contains: q, mode: "insensitive" } } } }
        ]
      },
      include: { translations: true },
      orderBy: { canonicalTitle: "asc" },
      take: 6
    })
  ]);
  return [
    ...milestones.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/history/${entry.slug}`, kind: locale === "fr" ? "Histoire" : "History", title: translation?.title ?? entry.slug, language: translation?.language ?? null }; }),
    ...mathematicians.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/mathematicians/${entry.slug}`, kind: locale === "fr" ? "Mathématicien" : "Mathematician", title: translation?.displayName ?? entry.name, language: translation?.language ?? null }; }),
    ...references.map((entry) => { const translation = localizedTranslation(entry.translations, locale); return { href: `/library/references/${entry.slug}`, kind: locale === "fr" ? "Référence" : "Reference", title: translation?.displayTitle ?? entry.canonicalTitle, language: translation?.language ?? null }; })
  ];
}
