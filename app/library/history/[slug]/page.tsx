import Link from "next/link";
import { libraryReturnHref } from "@/lib/library-browser";
import { notFound } from "next/navigation";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewActions } from "@/components/library/LibraryReviewActions";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryEntryRail, LibraryEntryToolbar } from "@/components/library/LibraryEntryNavigation";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { historyEraLabel, libraryLanguage, milestoneTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation } from "@/lib/library-queries";
import { canArchiveLibraryEntry, canEditLibraryDraft, canReviewLibraryEntry, canViewLibraryEntry } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function HistoryMilestonePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string; returnTo?: string }> }) {
  const { slug } = await params;
  const [locale, user, entry] = await Promise.all([
    getInterfaceLocale(), requireAdmin(),
    prisma.historyMilestone.findUnique({ where: { slug }, include: { translations: true, createdBy: true, reviewedBy: true, mathematicians: { where: { mathematician: { status: "PUBLISHED" } }, include: { mathematician: { include: { translations: true } } }, orderBy: { position: "asc" } }, referenceLinks: { where: { reference: { status: "PUBLISHED" } }, include: { reference: { include: { translations: true } } }, orderBy: { position: "asc" } }, conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } }, include: { concept: true }, orderBy: { position: "asc" } } } })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  const query = await searchParams;
  const contentLanguage = libraryLanguage(query?.lang ?? locale);
  const returnTo = libraryReturnHref(query?.returnTo, "/library/history");
  const translation = localizedTranslation(entry.translations, contentLanguage);
  if (!translation) notFound();
  const copy = libraryCopy[locale];
  const canEdit = canEditLibraryDraft(user, entry);
  const canReview = canReviewLibraryEntry(user, entry);
  const canArchive = canArchiveLibraryEntry(user);
  const editLanguage = libraryLanguage(translation.language);
  return (
    <ForestPageLayout titleBelowHero className="library-history-detail-page" title={<>{translation.title}<ContentLanguageFallback language={translation.language} expectedLanguage={contentLanguage} /></>} eyebrow={`${translation.yearLabel} · ${milestoneTypeLabel(entry.milestoneType, locale)}`} description={historyEraLabel(entry.era, locale)} heroImage="/art/history-forest-ruins.avif" heroAlt={locale === "fr" ? "Ruines de pierre au milieu de collines boisées" : "Stone ruins among forested hills"}>
      <LibraryTabs active="history" locale={locale} />
      <LibraryEntryToolbar locale={locale} backHref={returnTo} backLabel={locale === "fr" ? "Retour à l’histoire" : "Back to history"} href={`/library/history/${entry.slug}`} languages={entry.translations.map(t => t.language)} activeLanguage={translation.language} status={entry.status} reviewed={Boolean(entry.reviewedAt)} />
      <div className="library-detail-layout">
      <article className="library-history-detail">
        <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
        {!translation.summaryMarkdown.trim() && <p className="quality-banner quality-needs-work">{locale === "fr" ? "Ce repère est une ébauche. Vous pouvez contribuer à le compléter." : "This milestone is a stub. You can help complete it."}</p>}
        {entry.imageUrl && <div className="library-history-hero-image"><img src={entry.imageUrl} alt={entry.imageAlt ?? translation.title} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}
        <div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.summaryHtml }} />
        {(entry.mathematicians.length || entry.referenceLinks.length || entry.conceptLinks.length) > 0 && <section className="library-linked-section"><h2>{locale === "fr" ? "Liens" : "Related"}</h2><div className="library-related-links">{entry.mathematicians.map(({ mathematician }) => { const t = localizedTranslation(mathematician.translations, locale); return <p key={`m-${mathematician.id}`}><Link href={`/library/mathematicians/${mathematician.slug}`}>{t?.displayName ?? mathematician.name}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}{entry.referenceLinks.map(({ reference }) => { const t = localizedTranslation(reference.translations, locale); return <p key={`r-${reference.id}`}><Link href={`/library/references/${reference.slug}`}>{t?.displayTitle ?? reference.canonicalTitle}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}{entry.conceptLinks.map(({ concept }) => <p key={`c-${concept.id}`}><Link href={`/concepts/${concept.slug}`}>{concept.title}</Link><ContentLanguageFallback language={concept.language} expectedLanguage={locale} /></p>)}</div></section>}
      </article>
      <LibraryEntryRail locale={locale}
        editHref={canEdit ? `/library/history/${entry.slug}/edit?lang=${editLanguage}` : undefined}
        translateHref={canEdit ? `/library/history/${entry.slug}/edit?lang=${editLanguage === "fr" ? "en" : "fr"}` : undefined}
        attribution={(entry.createdBy || entry.reviewedBy) && <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />}
        management={(canArchive || (canReview && (entry.status === "PENDING_REVIEW" || (entry.status === "PUBLISHED" && !entry.reviewedAt)))) && <LibraryReviewActions entity="milestone" id={entry.id} locale={locale} status={entry.status} needsReviewAfterEdit={!entry.reviewedAt} baseUpdatedAt={entry.updatedAt.toISOString()} canReview={canReview} canArchive={canArchive} compact />}
      />
      </div>
    </ForestPageLayout>
  );
}
