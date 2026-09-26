import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Sigma, UsersRound } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryBreadcrumb, LibraryEntryRail, LibraryEntryToolbar } from "@/components/library/LibraryEntryNavigation";
import { LibraryMilestoneTypeIcon, LibraryReferenceTypeIcon } from "@/components/library/LibraryIcons";
import { LibraryPersonPortrait } from "@/components/library/LibraryPersonPortrait";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryLanguage, milestoneTypeLabel } from "@/lib/library";
import { libraryReferenceSummary, libraryReturnHref } from "@/lib/library-browser";
import { libraryCopy } from "@/lib/library-copy";
import { libraryEraOfPeriod, libraryEraOfYear } from "@/lib/library-display";
import { getLibraryEras } from "@/lib/library-eras";
import { localizedTranslation } from "@/lib/library-queries";
import { mathematicianPeriod } from "@/lib/mathematician-browser";
import { canEditLibraryDraft, canViewLibraryEntry } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Published milestones around this one, in chronological order (the current one included). */
async function chronology(id: number) {
  const rows = await prisma.historyMilestone.findMany({
    where: { OR: [{ status: "PUBLISHED" }, { id }] },
    select: { id: true, slug: true, sortYear: true, translations: { select: { language: true, title: true, yearLabel: true } } },
    orderBy: [{ sortYear: "asc" }, { id: "asc" }]
  });
  const index = rows.findIndex(row => row.id === id);
  const start = Math.max(0, Math.min(index - 3, rows.length - 7));
  return { previous: rows[index - 1] ?? null, next: rows[index + 1] ?? null, window: rows.slice(start, start + 7) };
}

export default async function HistoryMilestonePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string; returnTo?: string }> }) {
  const { slug } = await params;
  const [locale, user, eras, entry] = await Promise.all([
    getInterfaceLocale(), requireAdmin(), getLibraryEras(),
    prisma.historyMilestone.findUnique({ where: { slug }, include: { translations: true, createdBy: true, reviewedBy: true, mathematicians: { where: { mathematician: { status: "PUBLISHED" } }, include: { mathematician: { include: { translations: true } } }, orderBy: { position: "asc" } }, referenceLinks: { where: { reference: { status: "PUBLISHED" } }, include: { reference: { include: { translations: true } } }, orderBy: { position: "asc" } }, conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } }, include: { concept: true }, orderBy: { position: "asc" } } } })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  const query = await searchParams;
  const contentLanguage = libraryLanguage(query?.lang ?? locale);
  const returnTo = libraryReturnHref(query?.returnTo, "/library/history");
  const translation = localizedTranslation(entry.translations, contentLanguage);
  if (!translation) notFound();
  const { previous, next, window } = await chronology(entry.id);
  const copy = libraryCopy[locale];
  const fr = locale === "fr";
  const canEdit = canEditLibraryDraft(user, entry);
  const editLanguage = libraryLanguage(translation.language);
  const era = libraryEraOfYear(eras, entry.sortYear);
  const currentYear = new Date().getFullYear();
  const title = (row: { slug: string; translations: { language: string; title: string; yearLabel: string }[] }) => localizedTranslation(row.translations, locale) ?? { title: row.slug, yearLabel: "" };

  return (
    <ForestPageLayout
      titleBelowHero
      className="library-entry-page history-entry-page"
      eyebrow={<LibraryBreadcrumb locale={locale} section="history" backHref={returnTo} />}
      title={<>{translation.title}<ContentLanguageFallback language={translation.language} expectedLanguage={contentLanguage} /></>}
      description={<span className="library-dateline">
        <strong>{translation.yearLabel}</strong>
        <span className="library-dateline-type"><LibraryMilestoneTypeIcon type={entry.milestoneType} size={15} />{milestoneTypeLabel(entry.milestoneType, locale)}</span>
        {era && <Link href={`/library/history?era=${era.slug}` as never}>{era.name[locale]}</Link>}
      </span>}
      heroImage="/art/history-forest-ruins.avif"
      heroAlt={fr ? "Ruines de pierre au milieu de collines boisées" : "Stone ruins among forested hills"}
      meta={<LibraryEntryToolbar locale={locale} backHref={returnTo} href={`/library/history/${entry.slug}`} languages={entry.translations.map(t => t.language)} activeLanguage={translation.language} status={entry.status} reviewed={Boolean(entry.reviewedAt)} />}
    >
      <div className="library-detail-layout history-detail-layout">
        <article className="library-entry-article history-article">
          <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
          {!translation.summaryMarkdown.trim() && <p className="quality-banner quality-needs-work">{fr ? "Ce repère est une ébauche. Vous pouvez contribuer à le compléter." : "This milestone is a stub. You can help complete it."}</p>}

          {entry.imageUrl && <figure className="history-figure">
            <img src={entry.imageUrl} alt={entry.imageAlt ?? translation.title} />
            <ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} />
          </figure>}

          {translation.summaryHtml.trim() && <div className="library-reading-card history-reading-card">
            <div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.summaryHtml }} />
          </div>}

          {entry.mathematicians.length > 0 && <section className="library-entry-section" data-category="people">
            <h2><UsersRound size={18} aria-hidden="true" />{fr ? "Mathématiciens" : "Mathematicians"}<span className="library-entry-section-count">{entry.mathematicians.length}</span></h2>
            <ul className="library-people-cards">{entry.mathematicians.map(({ mathematician }) => {
              const t = localizedTranslation(mathematician.translations, locale);
              const name = t?.displayName ?? mathematician.name;
              const period = mathematicianPeriod(mathematician, currentYear);
              return <li key={mathematician.id}><Link href={`/library/mathematicians/${mathematician.slug}` as never}>
                <span className="library-thumb library-thumb-large"><LibraryPersonPortrait variant="thumb" name={name} portraitUrl={mathematician.portraitUrl} crop={mathematician.portraitCrop} era={period ? libraryEraOfPeriod(eras, period.from, period.to) : null} /></span>
                <span><strong>{name}</strong>{mathematician.lifespan && <small>{mathematician.lifespan}</small>}</span>
              </Link></li>;
            })}</ul>
          </section>}

          {entry.referenceLinks.length > 0 && <section className="library-entry-section" data-category="references">
            <h2><BookOpen size={18} aria-hidden="true" />{fr ? "Références" : "References"}<span className="library-entry-section-count">{entry.referenceLinks.length}</span></h2>
            <ol className="library-link-list">{entry.referenceLinks.map(({ reference, note }) => {
              const t = localizedTranslation(reference.translations, locale);
              return <li key={reference.id} className="library-link-item">
                <span className="library-type-icon"><LibraryReferenceTypeIcon type={reference.referenceType} size={17} /></span>
                <div>
                  <Link className="library-link-title" href={`/library/references/${reference.slug}` as never}>{t?.displayTitle ?? reference.canonicalTitle}</Link>
                  {(libraryReferenceSummary(reference) || note) && <small className="library-link-meta">{[libraryReferenceSummary(reference), note].filter(Boolean).join(" · ")}</small>}
                </div>
              </li>;
            })}</ol>
          </section>}

          {entry.conceptLinks.length > 0 && <section className="library-entry-section" data-category="concepts">
            <h2><Sigma size={18} aria-hidden="true" />{fr ? "Concepts" : "Concepts"}<span className="library-entry-section-count">{entry.conceptLinks.length}</span></h2>
            <ul className="library-chip-list">{entry.conceptLinks.map(({ concept }) => <li key={concept.id}><Link href={`/concepts/${concept.slug}` as never}>{concept.title}</Link><ContentLanguageFallback language={concept.language} expectedLanguage={locale} /></li>)}</ul>
          </section>}

          {(previous || next) && <nav className="library-sequence" aria-label={fr ? "Repères voisins" : "Neighbouring milestones"}>
            {previous ? <Link href={`/library/history/${previous.slug}` as never} rel="prev" className="library-sequence-link" data-direction="previous">
              <small><ArrowLeft size={14} aria-hidden="true" />{fr ? "Repère précédent" : "Previous milestone"}</small>
              <span><em>{title(previous).yearLabel}</em>{title(previous).title}</span>
            </Link> : <span />}
            {next && <Link href={`/library/history/${next.slug}` as never} rel="next" className="library-sequence-link" data-direction="next">
              <small>{fr ? "Repère suivant" : "Next milestone"}<ArrowRight size={14} aria-hidden="true" /></small>
              <span><em>{title(next).yearLabel}</em>{title(next).title}</span>
            </Link>}
          </nav>}
        </article>

        <LibraryEntryRail locale={locale} className="history-rail"
          editHref={canEdit ? `/library/history/${entry.slug}/edit?lang=${editLanguage}` : undefined}
          translateHref={canEdit ? `/library/history/${entry.slug}/edit?lang=${editLanguage === "fr" ? "en" : "fr"}` : undefined}
          attribution={(entry.createdBy || entry.reviewedBy) && <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />}
        >
          {window.length > 1 && <section className="concept-rail-section library-rail-chronology">
            <h2><Clock3 size={16} aria-hidden="true" />{fr ? "Sur la frise" : "On the timeline"}</h2>
            <ol>{window.map(row => {
              const label = title(row);
              return <li key={row.id} aria-current={row.id === entry.id ? "step" : undefined}>
                {row.id === entry.id ? <span><em>{label.yearLabel}</em><strong>{label.title}</strong></span>
                  : <Link href={`/library/history/${row.slug}` as never}><em>{label.yearLabel}</em><span>{label.title}</span></Link>}
              </li>;
            })}</ol>
            <Link className="library-more-link" href="/library/history">{fr ? "Toute la frise" : "Full timeline"}<ArrowRight size={14} aria-hidden="true" /></Link>
          </section>}
        </LibraryEntryRail>
      </div>
    </ForestPageLayout>
  );
}
