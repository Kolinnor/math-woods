import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ReferenceForm } from "@/components/library/ReferenceForm";
import { LibraryTranslationEditorNav } from "@/components/library/LibraryTranslationEditorNav";
import { updateLibraryReferenceAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryLanguage } from "@/lib/library";
import { canEditLibraryDraft } from "@/lib/permissions";

export default async function EditLibraryReferencePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const [user, locale, query, entry] = await Promise.all([requireAdmin(), getInterfaceLocale(), searchParams, prisma.libraryReference.findUnique({ where: { slug }, include: { translations: true } })]);
  if (!entry || !canEditLibraryDraft(user, entry)) notFound();
  const contentLanguage = libraryLanguage(query.lang ?? locale);
  const translation = entry.translations.find((item) => item.language === contentLanguage) ?? null;
  return <ForestPageLayout title={locale === "fr" ? "Modifier la référence" : "Edit reference"} meta={<p>{entry.canonicalTitle}</p>} heroImage="/art/oak-grove.jpg"><LibraryTranslationEditorNav baseHref={`/library/references/${entry.slug}/edit`} locale={locale} activeLanguage={contentLanguage} existingLanguages={entry.translations.map((item) => item.language)} /><ReferenceForm action={updateLibraryReferenceAction.bind(null, entry.id)} locale={locale} contentLanguage={contentLanguage} baseUpdatedAt={entry.updatedAt.toISOString()} values={{ ...entry, translation }} /></ForestPageLayout>;
}
