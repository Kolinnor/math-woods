import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortraitImage } from "@/components/library/PortraitImage";
import { Pencil } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { PortraitSource } from "@/components/library/PortraitSource";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewActions } from "@/components/library/LibraryReviewActions";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { MathematicianRelatedList } from "@/components/library/MathematicianRelatedList";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { mathematicianRelatedInclude, relatedItemViews } from "@/lib/mathematician-related-db";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation } from "@/lib/library-queries";
import { mathematicianName } from "@/lib/mathematician-names";
import { canArchiveLibraryEntry, canEditLibraryDraft, canReviewLibraryEntry, canViewLibraryEntry } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string }> };

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  await requireAdmin();
  const { slug } = await params;
  const [locale, entry] = await Promise.all([getInterfaceLocale(), prisma.mathematician.findUnique({ where: { slug }, select: { name: true, translations: { select: { language: true, displayName: true } } } })]);
  const query = await searchParams;
  const language = query?.lang === "fr" || query?.lang === "en" ? query.lang : locale;
  return { title: entry ? mathematicianName(entry, language) : "Mathematician" };
}

export default async function LibraryMathematicianPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const [locale, user, entry] = await Promise.all([
    getInterfaceLocale(),
    requireAdmin(),
    prisma.mathematician.findUnique({
      where: { slug },
      include: {
        translations: { include: { relatedItems: { include: mathematicianRelatedInclude, orderBy: [{ position: "asc" }, { id: "asc" }] } } },
        createdBy: true,
        reviewedBy: true,
        milestoneLinks: { where: { milestone: { status: "PUBLISHED" } }, include: { milestone: { include: { translations: true } } }, orderBy: { position: "asc" } }
      }
    })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  const query = await searchParams;
  const contentLanguage = query?.lang === "fr" || query?.lang === "en" ? query.lang : locale;
  const translation = localizedTranslation(entry.translations, contentLanguage);
  const relatedItems = await relatedItemViews(translation?.relatedItems ?? [], translation?.language ?? contentLanguage);
  const copy = libraryCopy[locale];
  const canEdit = Boolean(user && canEditLibraryDraft(user, entry));

  return (
    <ForestPageLayout title={<>{translation?.displayName ?? entry.name}{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={contentLanguage} />}</>} description={translation?.teaser ? <AsyncMarkdownInline markdown={translation.teaser} /> : undefined} heroImage="/art/birch-grove.jpg" actions={canEdit ? <><Link href={`/library/mathematicians/${entry.slug}/edit?lang=${contentLanguage}`} className="primary"><Pencil size={16} />{copy.edit}</Link><Link href={`/library/mathematicians/${entry.slug}/edit?lang=${contentLanguage === "fr" ? "en" : "fr"}`} className="button secondary">{locale === "fr" ? "Traduire" : "Translate"}</Link></> : undefined}>
      <LibraryTabs active="mathematicians" locale={locale} />
      <nav className="library-translation-editor" aria-label={locale === "fr" ? "Langue de la fiche" : "Entry language"}>{entry.translations.map(t => <Link key={t.language} href={`/library/mathematicians/${entry.slug}?lang=${t.language}`} aria-current={t.language === translation?.language ? "page" : undefined}>{t.language.toUpperCase()}</Link>)}</nav>
      <div className="library-detail-heading"><LibraryStatusBadge status={entry.status} locale={locale} /><p>{entry.lifespan}{translation?.birthPlace ? ` · ${translation.birthPlace}` : ""}</p></div>
      {entry.aliases.length > 0 && <details className="library-person-aliases"><summary>{locale === "fr" ? "Autres noms" : "Other names"}</summary><ul>{entry.aliases.map(alias => <li key={alias}>{alias}</li>)}</ul></details>}
      <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />
      <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
      <div className="library-detail-layout">
        <aside className="library-portrait-panel">
          {entry.portraitUrl ? <div className="library-detail-image"><PortraitImage src={entry.portraitUrl} alt={entry.imageAlt ?? translation?.displayName ?? entry.name} crop={entry.portraitCrop} /><PortraitSource credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} details={entry.portraitDetails} locale={locale} /></div> : <div className="library-portrait-placeholder">{entry.name.charAt(0)}</div>}
        </aside>
        <div className="library-detail-content">
          {translation?.biographyHtml && <section><h2>{locale === "fr" ? "Biographie" : "Biography"}</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.biographyHtml }} /></section>}
          {translation?.contributionsHtml && <section><h2>Contributions</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.contributionsHtml }} /></section>}
          <MathematicianRelatedList items={relatedItems} locale={locale} />
          {entry.milestoneLinks.length > 0 && <section><h2>{locale === "fr" ? "Repères historiques" : "Historical milestones"}</h2><div className="library-related-links">{entry.milestoneLinks.map(({ milestone }) => { const t = localizedTranslation(milestone.translations, locale); return <p key={milestone.id}><Link href={`/library/history/${milestone.slug}`}>{t?.title ?? milestone.slug}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}</div></section>}
          {user && <LibraryReviewActions entity="mathematician" id={entry.id} locale={locale} status={entry.status} canReview={canReviewLibraryEntry(user, entry)} canArchive={canArchiveLibraryEntry(user)} />}
        </div>
      </div>
    </ForestPageLayout>
  );
}
