import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewActions } from "@/components/library/LibraryReviewActions";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { historyEraLabel, milestoneTypeLabel } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation } from "@/lib/library-queries";
import { canArchiveLibraryEntry, canEditLibraryDraft, canReviewLibraryEntry, canViewLibraryEntry } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function HistoryMilestonePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [locale, user, entry] = await Promise.all([
    getInterfaceLocale(), requireAdmin(),
    prisma.historyMilestone.findUnique({ where: { slug }, include: { translations: true, createdBy: true, reviewedBy: true, mathematicians: { where: { mathematician: { status: "PUBLISHED" } }, include: { mathematician: { include: { translations: true } } }, orderBy: { position: "asc" } }, referenceLinks: { where: { reference: { status: "PUBLISHED" } }, include: { reference: { include: { translations: true } } }, orderBy: { position: "asc" } }, conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } }, include: { concept: true }, orderBy: { position: "asc" } } } })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  const translation = localizedTranslation(entry.translations, locale);
  if (!translation) notFound();
  const copy = libraryCopy[locale];
  return (
    <ForestPageLayout title={<>{translation.title}<ContentLanguageFallback language={translation.language} expectedLanguage={locale} /></>} eyebrow={`${translation.yearLabel} · ${milestoneTypeLabel(entry.milestoneType, locale)}`} description={historyEraLabel(entry.era, locale)} heroImage="/art/brook-in-the-forest.jpg" actions={user && canEditLibraryDraft(user, entry) ? <Link href={`/library/history/${entry.slug}/edit?lang=${locale}`} className="primary"><Pencil size={16} />{copy.edit}</Link> : undefined}>
      <LibraryTabs active="history" locale={locale} />
      <div className="library-detail-heading"><LibraryStatusBadge status={entry.status} locale={locale} /></div>
      <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />
      <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
      <article className="panel library-history-detail">
        {entry.imageUrl && <div className="library-history-hero-image"><img src={entry.imageUrl} alt={entry.imageAlt ?? translation.title} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}
        <div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.summaryHtml }} />
        {(entry.mathematicians.length || entry.referenceLinks.length || entry.conceptLinks.length) > 0 && <section className="library-linked-section"><h2>{locale === "fr" ? "Liens" : "Related"}</h2><div className="library-related-links">{entry.mathematicians.map(({ mathematician }) => { const t = localizedTranslation(mathematician.translations, locale); return <p key={`m-${mathematician.id}`}><Link href={`/library/mathematicians/${mathematician.slug}`}>{t?.displayName ?? mathematician.name}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}{entry.referenceLinks.map(({ reference }) => { const t = localizedTranslation(reference.translations, locale); return <p key={`r-${reference.id}`}><Link href={`/library/references/${reference.slug}`}>{t?.displayTitle ?? reference.canonicalTitle}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}{entry.conceptLinks.map(({ concept }) => <p key={`c-${concept.id}`}><Link href={`/concepts/${concept.slug}`}>{concept.title}</Link><ContentLanguageFallback language={concept.language} expectedLanguage={locale} /></p>)}</div></section>}
        {user && <LibraryReviewActions entity="milestone" id={entry.id} locale={locale} status={entry.status} canReview={canReviewLibraryEntry(user, entry)} canArchive={canArchiveLibraryEntry(user)} />}
      </article>
    </ForestPageLayout>
  );
}
