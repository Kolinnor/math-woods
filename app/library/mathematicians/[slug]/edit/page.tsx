import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MathematicianForm } from "@/components/library/MathematicianForm";
import { LibraryTranslationEditorNav } from "@/components/library/LibraryTranslationEditorNav";
import { updateMathematicianAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryLanguage } from "@/lib/library";
import { libraryFormOptions } from "@/lib/library-queries";
import { canEditLibraryDraft } from "@/lib/permissions";

export default async function EditLibraryMathematicianPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const [user, locale, query, entry, rawOptions] = await Promise.all([requireAdmin(), getInterfaceLocale(), searchParams, prisma.mathematician.findUnique({ where: { slug }, include: { translations: true, works: true, conceptLinks: true, problemLinks: true } }), libraryFormOptions()]);
  if (!entry || !canEditLibraryDraft(user, entry)) notFound();
  const contentLanguage = libraryLanguage(query.lang ?? locale);
  const translation = entry.translations.find((item) => item.language === contentLanguage) ?? null;
  const options = { references: rawOptions.references.map((item) => ({ id: item.id, label: item.canonicalTitle })), concepts: rawOptions.concepts.map((item) => ({ id: item.id, label: item.title })), problems: rawOptions.problems.map((item) => ({ id: item.id, label: item.title })) };
  return <ForestPageLayout title={locale === "fr" ? "Modifier le mathématicien" : "Edit mathematician"} meta={<p>{translation?.displayName ?? entry.name}</p>} heroImage="/art/birch-grove.jpg"><LibraryTranslationEditorNav baseHref={`/library/mathematicians/${entry.slug}/edit`} locale={locale} activeLanguage={contentLanguage} existingLanguages={entry.translations.map((item) => item.language)} /><MathematicianForm action={updateMathematicianAction.bind(null, entry.id)} locale={locale} contentLanguage={contentLanguage} baseUpdatedAt={entry.updatedAt.toISOString()} options={options} values={{ ...entry, translation, referenceIds: entry.works.map((item) => item.referenceId), conceptIds: entry.conceptLinks.map((item) => item.conceptId), problemIds: entry.problemLinks.map((item) => item.problemId) }} /></ForestPageLayout>;
}
