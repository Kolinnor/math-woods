import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { HistoryMilestoneForm } from "@/components/library/HistoryMilestoneForm";
import { LibraryTranslationEditorNav } from "@/components/library/LibraryTranslationEditorNav";
import { updateHistoryMilestoneAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryLanguage } from "@/lib/library";
import { libraryFormOptions } from "@/lib/library-queries";
import { canEditLibraryDraft } from "@/lib/permissions";

export default async function EditHistoryMilestonePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const [user, locale, query, entry, rawOptions] = await Promise.all([requireAdmin(), getInterfaceLocale(), searchParams, prisma.historyMilestone.findUnique({ where: { slug }, include: { translations: true, mathematicians: true, referenceLinks: true, conceptLinks: true } }), libraryFormOptions()]);
  if (!entry || !canEditLibraryDraft(user, entry)) notFound();
  const contentLanguage = libraryLanguage(query.lang ?? locale);
  const translation = entry.translations.find((item) => item.language === contentLanguage) ?? null;
  const options = { mathematicians: rawOptions.mathematicians.map((item) => ({ id: item.id, label: item.name })), references: rawOptions.references.map((item) => ({ id: item.id, label: item.canonicalTitle })), concepts: rawOptions.concepts.map((item) => ({ id: item.id, label: item.title })) };
  return <ForestPageLayout title={locale === "fr" ? "Modifier le repère" : "Edit milestone"} meta={<p>{translation?.title ?? entry.slug}</p>} heroImage="/art/brook-in-the-forest.jpg"><LibraryTranslationEditorNav baseHref={`/library/history/${entry.slug}/edit`} locale={locale} activeLanguage={contentLanguage} existingLanguages={entry.translations.map((item) => item.language)} /><HistoryMilestoneForm action={updateHistoryMilestoneAction.bind(null, entry.id)} locale={locale} contentLanguage={contentLanguage} baseUpdatedAt={entry.updatedAt.toISOString()} options={options} values={{ ...entry, translation, mathematicianIds: entry.mathematicians.map((item) => item.mathematicianId), referenceIds: entry.referenceLinks.map((item) => item.referenceId), conceptIds: entry.conceptLinks.map((item) => item.conceptId) }} /></ForestPageLayout>;
}
