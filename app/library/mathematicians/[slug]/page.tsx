import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, UsersRound } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { PortraitSource } from "@/components/library/PortraitSource";
import { LibraryAttribution } from "@/components/library/LibraryAttribution";
import { LibraryBreadcrumb, LibraryEntryRail, LibraryEntryToolbar } from "@/components/library/LibraryEntryNavigation";
import { LibraryPersonPortrait } from "@/components/library/LibraryPersonPortrait";
import { LibraryReviewNote } from "@/components/library/LibraryReviewNote";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { MathematicianRelatedList } from "@/components/library/MathematicianRelatedList";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { mathematicianRelatedInclude, relatedItemViews } from "@/lib/mathematician-related-db";
import { localizedTranslation } from "@/lib/library-queries";
import { libraryEraOfPeriod, type LibraryEraView } from "@/lib/library-display";
import { getLibraryEras } from "@/lib/library-eras";
import { mathematicianName } from "@/lib/mathematician-names";
import { isMathematicianStub, mathematicianPeriod, mathematiciansReturnHref } from "@/lib/mathematician-browser";
import { canEditLibraryMathematician, canViewLibraryMathematician } from "@/lib/permissions";

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

type Period = { from: number; to: number };

/** Published people whose lives overlap this one, the closest first. */
async function contemporaries(id: number, period: Period | null, currentYear: number, eras: LibraryEraView[]) {
  if (!period) return [];
  const people = await prisma.mathematician.findMany({
    where: { id: { not: id }, status: "PUBLISHED" },
    select: { id: true, slug: true, name: true, lifespan: true, portraitUrl: true, portraitCrop: true, periodStartYear: true, periodEndYear: true, translations: { select: { language: true, displayName: true } } }
  });
  return people
    .map(person => ({ person, period: mathematicianPeriod(person, currentYear) }))
    .filter((item): item is { person: typeof people[number]; period: Period } => Boolean(item.period && item.period.from <= period.to && item.period.to >= period.from))
    .map(item => ({ ...item, era: libraryEraOfPeriod(eras, item.period.from, item.period.to) }))
    .sort((a, b) => Math.abs(a.period.from - period.from) - Math.abs(b.period.from - period.from) || a.person.name.localeCompare(b.person.name))
    .slice(0, 5);
}

export default async function LibraryMathematicianPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const [locale, user, eras, entry] = await Promise.all([
    getInterfaceLocale(),
    requireAdmin(),
    getLibraryEras(),
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
  const period = mathematicianPeriod(entry, new Date().getFullYear());
  const [relatedItems, peers] = await Promise.all([
    relatedItemViews(translation?.relatedItems ?? [], translation?.language ?? contentLanguage),
    contemporaries(entry.id, period, new Date().getFullYear(), eras)
  ]);
  const canEdit = Boolean(user && canEditLibraryMathematician(user, entry));
  const fr = locale === "fr";
  const displayName = translation?.displayName ?? entry.name;
  const birthPlace = translation?.birthPlace?.trim();
  const hasBirthPlace = birthPlace && !/^(inconnu(?:e)?|unknown)$/i.test(birthPlace);
  const era = period ? libraryEraOfPeriod(eras, period.from, period.to) : null;
  const hasIdentity = Boolean(entry.portraitUrl || entry.lifespan || hasBirthPlace || entry.aliases.length);
  const isStub = isMathematicianStub(translation);
  const milestones = [...entry.milestoneLinks].sort((a, b) => a.milestone.sortYear - b.milestone.sortYear);

  return (
    <ForestPageLayout
      titleBelowHero
      className="library-entry-page mathematician-page"
      eyebrow={<LibraryBreadcrumb locale={locale} section="mathematicians" backHref={returnTo} />}
      title={<>{displayName}{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={contentLanguage} />}</>}
      description={translation?.teaser ? <AsyncMarkdownInline markdown={translation.teaser} /> : undefined}
      heroImage="/art/birch-grove.jpg"
      meta={<LibraryEntryToolbar locale={locale} backHref={returnTo} href={`/library/mathematicians/${entry.slug}`} languages={entry.translations.map(t => t.language)} activeLanguage={translation?.language ?? contentLanguage} status={entry.status} reviewed={!entry.needsReviewAfterEdit} />}
    >
      <div className="library-detail-layout mathematician-detail-layout">
        <article className="library-entry-article mathematician-article">
          {isStub && <p className="quality-banner quality-stub mathematician-stub-notice"><strong>{fr ? "Cet article est une ébauche." : "This article is a stub."}</strong>{" "}{fr ? "Vous pouvez contribuer à le compléter." : "You can help expand it."}</p>}
          {entry.status === "PUBLISHED" && entry.needsReviewAfterEdit && <p className="quality-banner quality-needs-work mathematician-stub-notice">{fr ? "Cette fiche est publiée et attend une relecture indépendante." : "This entry is published and awaits an independent review."}</p>}
          <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />

          {hasIdentity && <section className="mathematician-biographical-panel" aria-label={fr ? "Repères biographiques" : "Biographical information"}>
            <figure className="mathematician-portrait">
              <LibraryPersonPortrait name={displayName} portraitUrl={entry.portraitUrl} crop={entry.portraitCrop} alt={entry.imageAlt ?? displayName} era={era} />
              {entry.portraitUrl && <PortraitSource credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} details={entry.portraitDetails} locale={locale} />}
            </figure>
            <dl className="mathematician-facts">
              {entry.lifespan && <div><dt>{fr ? "Dates" : "Dates"}</dt><dd>{entry.lifespan}</dd></div>}
              {hasBirthPlace && <div><dt>{fr ? "Lieu de naissance" : "Birthplace"}</dt><dd>{birthPlace}</dd></div>}
              {era && <div><dt>{fr ? "Époque" : "Era"}</dt><dd><Link href={`/library/mathematicians?era=${era.slug}` as never}>{era.name[locale]}</Link></dd></div>}
              {entry.aliases.length > 0 && <div className="mathematician-aliases"><dt>{fr ? "Autres noms" : "Other names"}</dt><dd><ul>{entry.aliases.map(alias => <li key={alias}>{alias}</li>)}</ul></dd></div>}
            </dl>
          </section>}

          {(translation?.biographyHtml || translation?.contributionsHtml) && <div className="library-reading-card">
            {translation?.biographyHtml && <section><h2>{fr ? "Biographie" : "Biography"}</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.biographyHtml }} /></section>}
            {translation?.contributionsHtml && <section><h2>Contributions</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.contributionsHtml }} /></section>}
          </div>}

          <MathematicianRelatedList items={relatedItems} locale={locale} />

          {milestones.length > 0 && <section className="library-entry-section" data-category="history">
            <h2><Clock3 size={18} aria-hidden="true" />{fr ? "Dans l’histoire" : "In history"}<span className="library-entry-section-count">{milestones.length}</span></h2>
            <ol className="library-mini-timeline">{milestones.map(({ milestone }) => {
              const t = localizedTranslation(milestone.translations, locale);
              return <li key={milestone.id}><span className="library-mini-timeline-date">{t?.yearLabel ?? milestone.sortYear}</span><Link href={`/library/history/${milestone.slug}`}>{t?.title ?? milestone.slug}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</li>;
            })}</ol>
          </section>}
        </article>

        <LibraryEntryRail locale={locale} className="mathematician-rail"
          editHref={canEdit ? `/library/mathematicians/${entry.slug}/edit?lang=${contentLanguage}` : undefined}
          translateHref={canEdit ? `/library/mathematicians/${entry.slug}/edit?lang=${contentLanguage === "fr" ? "en" : "fr"}` : undefined}
          attribution={(entry.createdBy || entry.reviewedBy) && <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />}
        >
          {peers.length > 0 && <section className="concept-rail-section library-rail-people">
            <h2><UsersRound size={16} aria-hidden="true" />{fr ? "Contemporains" : "Contemporaries"}</h2>
            <ul>{peers.map(({ person, era: personEra }) => {
              const name = localizedTranslation(person.translations, locale)?.displayName ?? person.name;
              return <li key={person.id}><Link href={`/library/mathematicians/${person.slug}` as never}>
                <span className="library-thumb"><LibraryPersonPortrait variant="thumb" name={name} portraitUrl={person.portraitUrl} crop={person.portraitCrop} era={personEra} /></span>
                <span><strong>{name}</strong><small>{person.lifespan}</small></span>
              </Link></li>;
            })}</ul>
          </section>}
        </LibraryEntryRail>
      </div>
    </ForestPageLayout>
  );
}
