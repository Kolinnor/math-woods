import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BookCopy, Clock3, Code2, ExternalLink, Puzzle, Sigma, TreePine, UsersRound } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryBreadcrumb, LibraryEntryRail, LibraryEntryToolbar } from "@/components/library/LibraryEntryNavigation";
import { LibraryReferenceTypeIcon } from "@/components/library/LibraryIcons";
import { LibraryPersonPortrait } from "@/components/library/LibraryPersonPortrait";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { formatLibraryReference, libraryLanguage, referenceRoleLabel, referenceTypeLabel } from "@/lib/library";
import { libraryReferenceSummary, libraryReturnHref } from "@/lib/library-browser";
import { libraryCopy } from "@/lib/library-copy";
import { referenceBibtexReport } from "@/lib/reference-bibtex";
import { localizedTranslation } from "@/lib/library-queries";
import { mathematicianPeriod } from "@/lib/mathematician-browser";
import { canEditLibraryReference, canViewLibraryEntry } from "@/lib/permissions";
import { libraryEraOfPeriod } from "@/lib/library-display";
import { getLibraryEras } from "@/lib/library-eras";

export const dynamic = "force-dynamic";

function hostName(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default async function LibraryReferencePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ duplicate?: string; lang?: string; returnTo?: string }> }) {
  const { slug } = await params;
  const [locale, user, query, eras, entry] = await Promise.all([
    getInterfaceLocale(), requireAdmin(), searchParams, getLibraryEras(),
    prisma.libraryReference.findUnique({
      where: { slug },
      include: {
        mergedInto: { select: { slug: true } },
        work: true,
        editions: { where: { status: "PUBLISHED", searchable: true, mergedIntoId: null }, orderBy: [{ year: "asc" }, { id: "asc" }] },
        translations: true,
        createdBy: true,
        reviewedBy: true,
        problemLinks: { where: { problem: { listed: true, status: "PUBLISHED" } }, include: { problem: true }, orderBy: { position: "asc" } },
        conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } }, include: { concept: true }, orderBy: { position: "asc" } },
        mathematicianRelatedItems: { where: { translation: { mathematician: { status: "PUBLISHED" } } }, include: { translation: { include: { mathematician: true } } }, orderBy: { position: "asc" } },
        milestoneLinks: { where: { milestone: { status: "PUBLISHED" } }, include: { milestone: { include: { translations: true } } }, orderBy: { position: "asc" } }
      }
    })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  if (entry.mergedInto) permanentRedirect(`/library/references/${entry.mergedInto.slug}`);
  // One backlink per person and role, rather than one per translated citation.
  const preferredItems = [...entry.mathematicianRelatedItems].sort((a, b) => Number(a.translation.language === locale) - Number(b.translation.language === locale));
  const relatedPeople = [...new Map(preferredItems.map(item => [`${item.translation.mathematicianId}:${item.category}`, item])).values()];
  const milestones = [...entry.milestoneLinks].sort((a, b) => a.milestone.sortYear - b.milestone.sortYear);
  const contentLanguage = libraryLanguage(query.lang ?? locale);
  const returnTo = libraryReturnHref(query.returnTo, "/library/references");
  const translation = localizedTranslation(entry.translations, contentLanguage);
  const copy = libraryCopy[locale];
  const fr = locale === "fr";
  const bibliography = referenceBibtexReport(entry, locale);
  const canEdit = canEditLibraryReference(user, entry);
  const editLanguage = libraryLanguage(translation?.language ?? contentLanguage);
  const currentYear = new Date().getFullYear();
  const doi = entry.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const byline = libraryReferenceSummary(entry);
  // The byline and the citation already give authors, year and publisher.
  const facts = ([
    [fr ? "Revue" : "Journal", entry.journal && [entry.journal, entry.volume && `vol. ${entry.volume}`, entry.issue && `n° ${entry.issue}`, entry.pages && `p. ${entry.pages}`].filter(Boolean).join(", ")],
    [fr ? "Édition" : "Edition", [entry.edition, !entry.journal && entry.volume && `vol. ${entry.volume}`, !entry.journal && entry.pages && `p. ${entry.pages}`].filter(Boolean).join(", ")],
    [fr ? "Traduction" : "Translation", entry.translator],
    [fr ? "Responsables de l’édition" : "Editors", entry.editors],
    ["ISBN", entry.isbn]
  ] as const).filter(([, value]) => value);
  const peopleRole = (category: string) => category === "SOURCE" ? (fr ? "citée comme source" : "cited as a source") : category === "WORK" ? (fr ? "œuvre de cette personne" : "work by this person") : (fr ? "référence associée" : "related reference");
  const siteLinks = entry.problemLinks.length + entry.conceptLinks.length;

  return (
    <ForestPageLayout
      titleBelowHero
      className="library-entry-page reference-entry-page"
      eyebrow={<LibraryBreadcrumb locale={locale} section="references" backHref={returnTo} />}
      title={<>{translation?.displayTitle ?? entry.canonicalTitle}{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={contentLanguage} />}</>}
      description={byline || undefined}
      heroImage="/art/oak-grove.jpg"
      meta={<LibraryEntryToolbar locale={locale} backHref={returnTo} href={`/library/references/${entry.slug}`} languages={entry.translations.map(t => t.language)} activeLanguage={editLanguage} status={entry.status} reviewed={Boolean(entry.reviewedAt)} />}
    >
      <div className="library-detail-layout reference-detail-layout">
        <article className="library-entry-article reference-article">
          {query.duplicate && <p className="quality-banner">{fr ? "Cette référence existe déjà : vous avez été redirigé vers sa fiche." : "This reference already exists, so you were redirected to its record."}</p>}
          <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />

          <section className="reference-record" data-type={entry.referenceType.toLowerCase()} aria-label={fr ? "Notice bibliographique" : "Bibliographic record"}>
            <div className="reference-record-cover">
              {entry.iconUrl
                ? <><img src={entry.iconUrl} alt={entry.imageAlt ?? ""} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></>
                : <LibraryReferenceTypeIcon type={entry.referenceType} size={30} />}
            </div>
            <div className="reference-record-body">
              <p className="library-kicker">{referenceTypeLabel(entry.referenceType, locale)}</p>
              <p className="library-citation">{formatLibraryReference(entry)}</p>
              {facts.length > 0 && <dl className="reference-record-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
              {(entry.url || doi || entry.work) && <div className="reference-record-actions">
                {entry.url && <a className="button primary library-consult" href={entry.url} rel="noreferrer" target="_blank"><ExternalLink size={16} aria-hidden="true" />{fr ? "Consulter" : "Open"}<span className="reference-record-host">{hostName(entry.url)}</span></a>}
                {doi && <a className="button secondary" href={`https://doi.org/${doi}`} rel="noreferrer" target="_blank">DOI <span className="reference-record-host">{doi}</span></a>}
                {entry.work && <p className="reference-record-work">{fr ? "Édition de " : "Edition of "}<Link href={`/library/references/${entry.work.slug}` as never}>{entry.work.canonicalTitle}</Link></p>}
              </div>}
            </div>
          </section>

          {translation?.descriptionHtml.trim() && <div className="library-reading-card">
            <section><h2>{fr ? "Présentation" : "About"}</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.descriptionHtml }} /></section>
          </div>}

          {entry.editions.length > 0 && <section className="library-entry-section" data-category="editions">
            <h2><BookCopy size={18} aria-hidden="true" />{fr ? "Éditions et traductions" : "Editions and translations"}<span className="library-entry-section-count">{entry.editions.length}</span></h2>
            <ol className="library-link-list">{entry.editions.map(edition => <li key={edition.id} className="library-link-item">
              <span className="library-type-icon"><LibraryReferenceTypeIcon type={edition.referenceType} size={17} /></span>
              <div><Link className="library-link-title" href={`/library/references/${edition.slug}` as never}>{formatLibraryReference(edition)}</Link></div>
            </li>)}</ol>
          </section>}

          {relatedPeople.length > 0 && <section className="library-entry-section" data-category="people">
            <h2><UsersRound size={18} aria-hidden="true" />{fr ? "Mathématiciens" : "Mathematicians"}<span className="library-entry-section-count">{relatedPeople.length}</span></h2>
            <ul className="library-people-cards">{relatedPeople.map(item => {
              const person = item.translation.mathematician;
              const period = mathematicianPeriod(person, currentYear);
              return <li key={`${item.translation.mathematicianId}:${item.category}`}><Link href={`/library/mathematicians/${person.slug}?lang=${item.translation.language}` as never}>
                <span className="library-thumb library-thumb-large"><LibraryPersonPortrait variant="thumb" name={item.translation.displayName} portraitUrl={person.portraitUrl} crop={person.portraitCrop} era={period ? libraryEraOfPeriod(eras, period.from, period.to) : null} /></span>
                <span><strong>{item.translation.displayName}</strong><small>{peopleRole(item.category)}</small></span>
              </Link></li>;
            })}</ul>
          </section>}

          {milestones.length > 0 && <section className="library-entry-section" data-category="history">
            <h2><Clock3 size={18} aria-hidden="true" />{fr ? "Dans l’histoire" : "In history"}<span className="library-entry-section-count">{milestones.length}</span></h2>
            <ol className="library-mini-timeline">{milestones.map(({ milestone, note }) => {
              const t = localizedTranslation(milestone.translations, locale);
              return <li key={milestone.id}><span className="library-mini-timeline-date">{t?.yearLabel ?? milestone.sortYear}</span><Link href={`/library/history/${milestone.slug}` as never}>{t?.title ?? milestone.slug}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}{note && <small className="library-link-meta">{note}</small>}</li>;
            })}</ol>
          </section>}

          {siteLinks > 0 && <section className="library-entry-section" data-category="site">
            <h2><TreePine size={18} aria-hidden="true" />{fr ? "Sur Math Woods" : "On Math Woods"}<span className="library-entry-section-count">{siteLinks}</span></h2>
            <ol className="library-link-list">
              {entry.conceptLinks.map(link => <li key={`c-${link.id}`} className="library-link-item">
                <span className="library-type-icon" data-kind="concept"><Sigma size={17} aria-hidden="true" /></span>
                <div><span><Link className="library-link-title" href={`/concepts/${link.concept.slug}` as never}>{link.concept.title}</Link><ContentLanguageFallback language={link.concept.language} expectedLanguage={locale} /></span><small className="library-link-meta">{fr ? "Concept" : "Concept"} · {referenceRoleLabel(link.role, locale)}{link.locator ? `, ${link.locator}` : ""}</small></div>
              </li>)}
              {entry.problemLinks.map(link => <li key={`p-${link.id}`} className="library-link-item">
                <span className="library-type-icon" data-kind="problem"><Puzzle size={17} aria-hidden="true" /></span>
                <div><span><Link className="library-link-title" href={`/problems/${link.problem.slug}` as never}>{link.problem.title}</Link><ContentLanguageFallback language={link.problem.language} expectedLanguage={locale} /></span><small className="library-link-meta">{fr ? "Problème" : "Problem"} · {referenceRoleLabel(link.role, locale)}{link.locator ? `, ${link.locator}` : ""}</small></div>
              </li>)}
            </ol>
          </section>}

          <details className="library-bibtex-panel">
            <summary><Code2 size={16} aria-hidden="true" />{fr ? "Citer cette référence (BibTeX)" : "Cite this reference (BibTeX)"}<span className="library-bibtex-key">{bibliography.key}</span></summary>
            {[...bibliography.errors, ...bibliography.warnings].map((message, index) => <p className="muted" key={index}>{message}</p>)}
            <pre className="library-bibtex">{bibliography.text}</pre>
          </details>
        </article>

        <LibraryEntryRail locale={locale} className="reference-rail"
          editHref={canEdit ? `/library/references/${entry.slug}/edit?lang=${editLanguage}` : undefined}
          translateHref={canEdit ? `/library/references/${entry.slug}/edit?lang=${editLanguage === "fr" ? "en" : "fr"}` : undefined}
          attribution={(entry.createdBy || entry.reviewedBy) && <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />}
        />
      </div>
    </ForestPageLayout>
  );
}
