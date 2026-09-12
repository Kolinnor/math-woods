import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortraitImage } from "@/components/library/PortraitImage";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { PortraitSource } from "@/components/library/PortraitSource";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryReviewActions } from "@/components/library/LibraryReviewActions";
import { LibraryEntryRail, LibraryEntryToolbar } from "@/components/library/LibraryEntryNavigation";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { MathematicianRelatedList } from "@/components/library/MathematicianRelatedList";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { mathematicianRelatedInclude, relatedItemViews } from "@/lib/mathematician-related-db";
import { localizedTranslation } from "@/lib/library-queries";
import { mathematicianName } from "@/lib/mathematician-names";
import { isMathematicianStub, mathematiciansReturnHref } from "@/lib/mathematician-browser";
import { canArchiveLibraryEntry, canEditLibraryMathematician, canReviewLibraryMathematician, canViewLibraryMathematician } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string; returnTo?: string }> };

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
  if (!entry || !canViewLibraryMathematician(user, entry)) notFound();
  const query = await searchParams;
  const contentLanguage = query?.lang === "fr" || query?.lang === "en" ? query.lang : locale;
  const translation = localizedTranslation(entry.translations, contentLanguage);
  const returnTo = mathematiciansReturnHref(query?.returnTo);
  const relatedItems = await relatedItemViews(translation?.relatedItems ?? [], translation?.language ?? contentLanguage);
  const canEdit = Boolean(user && canEditLibraryMathematician(user, entry));
  const canReview = Boolean(user && canReviewLibraryMathematician(user, entry));
  const canArchive = Boolean(user && canArchiveLibraryEntry(user));
  const birthPlace = translation?.birthPlace?.trim();
  const hasBirthPlace = birthPlace && !/^(inconnu(?:e)?|unknown)$/i.test(birthPlace);
  const hasIdentity = Boolean(entry.portraitUrl || entry.lifespan || hasBirthPlace || entry.aliases.length);
  const isStub = isMathematicianStub(translation);

  return (
    <ForestPageLayout titleBelowHero className="mathematician-page" title={<>{translation?.displayName ?? entry.name}{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={contentLanguage} />}</>} description={translation?.teaser ? <AsyncMarkdownInline markdown={translation.teaser} /> : undefined} heroImage="/art/birch-grove.jpg">
      <LibraryTabs active="mathematicians" locale={locale} />
      <LibraryEntryToolbar locale={locale} backHref={returnTo} backLabel={locale === "fr" ? "Retour aux mathématiciens" : "Back to mathematicians"} href={`/library/mathematicians/${entry.slug}`} languages={entry.translations.map(t => t.language)} activeLanguage={translation?.language ?? contentLanguage} status={entry.status} reviewed={!entry.needsReviewAfterEdit} />
      <div className="mathematician-detail-layout">
      <article className="mathematician-article">
      {isStub && <p className="quality-banner quality-stub mathematician-stub-notice"><strong>{locale === "fr" ? "Cet article est une ébauche." : "This article is a stub."}</strong>{" "}{locale === "fr" ? "Vous pouvez contribuer à le compléter." : "You can help expand it."}</p>}
      {entry.status === "PUBLISHED" && entry.needsReviewAfterEdit && <p className="quality-banner quality-needs-work mathematician-stub-notice">{locale === "fr" ? "Cette fiche est publiée et attend une relecture indépendante." : "This entry is published and awaits an independent review."}</p>}
      <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
      <div className={`mathematician-reading-layout${hasIdentity ? "" : " mathematician-reading-layout-text-only"}`}>
        {hasIdentity && <aside className="mathematician-biographical-panel" aria-label={locale === "fr" ? "Repères biographiques" : "Biographical information"}>
          {entry.portraitUrl && <figure className="mathematician-portrait"><PortraitImage src={entry.portraitUrl} alt={entry.imageAlt ?? translation?.displayName ?? entry.name} crop={entry.portraitCrop} /><PortraitSource credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} details={entry.portraitDetails} locale={locale} /></figure>}
          {(entry.lifespan || hasBirthPlace) && <dl className="mathematician-facts">
            {entry.lifespan && <div><dt>Dates</dt><dd>{entry.lifespan}</dd></div>}
            {hasBirthPlace && <div><dt>{locale === "fr" ? "Lieu de naissance" : "Birthplace"}</dt><dd>{birthPlace}</dd></div>}
          </dl>}
          {entry.aliases.length > 0 && <details className="library-person-aliases"><summary>{locale === "fr" ? "Autres noms" : "Other names"}</summary><ul>{entry.aliases.map(alias => <li key={alias}>{alias}</li>)}</ul></details>}
        </aside>}
        <div className="library-detail-content">
          {translation?.biographyHtml && <section><h2>{locale === "fr" ? "Biographie" : "Biography"}</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.biographyHtml }} /></section>}
          {translation?.contributionsHtml && <section><h2>Contributions</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.contributionsHtml }} /></section>}
          <MathematicianRelatedList items={relatedItems} locale={locale} />
          {entry.milestoneLinks.length > 0 && <section><h2>{locale === "fr" ? "Repères historiques" : "Historical milestones"}</h2><div className="library-related-links">{entry.milestoneLinks.map(({ milestone }) => { const t = localizedTranslation(milestone.translations, locale); return <p key={milestone.id}><Link href={`/library/history/${milestone.slug}`}>{t?.title ?? milestone.slug}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}</div></section>}
        </div>
      </div>
      </article>
      <LibraryEntryRail locale={locale} className="mathematician-rail"
        editHref={canEdit ? `/library/mathematicians/${entry.slug}/edit?lang=${contentLanguage}` : undefined}
        translateHref={canEdit ? `/library/mathematicians/${entry.slug}/edit?lang=${contentLanguage === "fr" ? "en" : "fr"}` : undefined}
        attribution={(entry.createdBy || entry.reviewedBy) && <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />}
        management={(canArchive || (canReview && (entry.status === "PENDING_REVIEW" || entry.needsReviewAfterEdit))) && <LibraryReviewActions entity="mathematician" id={entry.id} locale={locale} status={entry.status} canReview={canReview} canArchive={canArchive} needsReviewAfterEdit={entry.needsReviewAfterEdit} baseUpdatedAt={entry.updatedAt.toISOString()} compact />}
      />
      </div>
    </ForestPageLayout>
  );
}
