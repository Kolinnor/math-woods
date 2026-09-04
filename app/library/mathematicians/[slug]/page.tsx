import type { Metadata } from "next";
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
import { formatLibraryReference } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation } from "@/lib/library-queries";
import { canArchiveLibraryEntry, canEditLibraryDraft, canReviewLibraryEntry, canViewLibraryEntry } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdmin();
  const { slug } = await params;
  const entry = await prisma.mathematician.findUnique({ where: { slug }, select: { name: true } });
  return { title: entry?.name ?? "Mathematician" };
}

export default async function LibraryMathematicianPage({ params }: PageProps) {
  const { slug } = await params;
  const [locale, user, entry] = await Promise.all([
    getInterfaceLocale(),
    requireAdmin(),
    prisma.mathematician.findUnique({
      where: { slug },
      include: {
        translations: true,
        createdBy: true,
        reviewedBy: true,
        works: { where: { reference: { status: "PUBLISHED" } }, include: { reference: true }, orderBy: { position: "asc" } },
        conceptLinks: { where: { concept: { canAppearInConceptBrowser: true } }, include: { concept: true }, orderBy: { position: "asc" } },
        problemLinks: { where: { problem: { listed: true, status: "PUBLISHED" } }, include: { problem: true }, orderBy: { position: "asc" } },
        milestoneLinks: { where: { milestone: { status: "PUBLISHED" } }, include: { milestone: { include: { translations: true } } }, orderBy: { position: "asc" } }
      }
    })
  ]);
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();
  const translation = localizedTranslation(entry.translations, locale);
  const copy = libraryCopy[locale];
  const canEdit = Boolean(user && canEditLibraryDraft(user, entry));

  return (
    <ForestPageLayout title={<>{translation?.displayName ?? entry.name}{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</>} description={translation?.teaser} heroImage="/art/birch-grove.jpg" actions={canEdit ? <Link href={`/library/mathematicians/${entry.slug}/edit?lang=${locale}`} className="primary"><Pencil size={16} />{copy.edit}</Link> : undefined}>
      <LibraryTabs active="mathematicians" locale={locale} />
      <div className="library-detail-heading"><LibraryStatusBadge status={entry.status} locale={locale} /><p>{entry.lifespan}{translation?.birthPlace ? ` · ${translation.birthPlace}` : ""}</p></div>
      <LibraryAttribution creator={entry.createdBy} reviewer={entry.reviewedBy} locale={locale} />
      <LibraryReviewNote status={entry.status} note={entry.reviewNote} locale={locale} />
      <div className="library-detail-layout">
        <aside className="library-portrait-panel">
          {entry.portraitUrl ? <div className="library-detail-image"><img src={entry.portraitUrl} alt={entry.imageAlt ?? translation?.displayName ?? entry.name} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div> : <div className="library-portrait-placeholder">{entry.name.charAt(0)}</div>}
          {entry.fields.length > 0 && <p className="library-tags">{entry.fields.join(" · ")}</p>}
        </aside>
        <div className="library-detail-content">
          {translation?.biographyHtml && <section><h2>{locale === "fr" ? "Biographie" : "Biography"}</h2><div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.biographyHtml }} /></section>}
          {(translation?.contributionsHtml || entry.problemLinks.length || entry.conceptLinks.length) && <section><h2>{locale === "fr" ? "Contributions" : "Contributions"}</h2>{translation?.contributionsHtml && <div className="prose-math" dangerouslySetInnerHTML={{ __html: translation.contributionsHtml }} />}<div className="library-related-links">{entry.conceptLinks.map(({ concept, note }) => <p key={`c-${concept.id}`}><Link href={`/concepts/${concept.slug}`}>{concept.title}</Link><ContentLanguageFallback language={concept.language} expectedLanguage={locale} />{note ? ` — ${note}` : ""}</p>)}{entry.problemLinks.map(({ problem, note }) => <p key={`p-${problem.id}`}><Link href={`/problems/${problem.slug}`}>{problem.title}</Link><ContentLanguageFallback language={problem.language} expectedLanguage={locale} />{note ? ` — ${note}` : ""}</p>)}</div></section>}
          {entry.works.length > 0 && <section><h2>{locale === "fr" ? "Œuvres et références" : "Works and references"}</h2><ul className="library-bibliography">{entry.works.map(({ reference, note }) => <li key={reference.id}><Link href={`/library/references/${reference.slug}`}>{formatLibraryReference(reference)}</Link>{note ? ` — ${note}` : ""}</li>)}</ul></section>}
          {entry.milestoneLinks.length > 0 && <section><h2>{locale === "fr" ? "Repères historiques" : "Historical milestones"}</h2><div className="library-related-links">{entry.milestoneLinks.map(({ milestone }) => { const t = localizedTranslation(milestone.translations, locale); return <p key={milestone.id}><Link href={`/library/history/${milestone.slug}`}>{t?.title ?? milestone.slug}</Link>{t && <ContentLanguageFallback language={t.language} expectedLanguage={locale} />}</p>; })}</div></section>}
          {user && <LibraryReviewActions entity="mathematician" id={entry.id} locale={locale} status={entry.status} canReview={canReviewLibraryEntry(user, entry)} canArchive={canArchiveLibraryEntry(user)} />}
        </div>
      </div>
    </ForestPageLayout>
  );
}
