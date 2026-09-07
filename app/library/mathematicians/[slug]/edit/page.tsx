import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MathematicianForm } from "@/components/library/MathematicianForm";
import { LibraryTranslationEditorNav } from "@/components/library/LibraryTranslationEditorNav";
import { saveMathematicianFormAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryLanguage } from "@/lib/library";
import { mathematicianRelatedInclude, relatedItemViews } from "@/lib/mathematician-related-db";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { canEditLibraryDraft } from "@/lib/permissions";

export default async function EditLibraryMathematicianPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const [user, locale, query, entry] = await Promise.all([requireAdmin(), getInterfaceLocale(), searchParams, prisma.mathematician.findUnique({ where: { slug }, include: { translations: { include: { relatedItems: { include: mathematicianRelatedInclude, orderBy: [{ position: "asc" }, { id: "asc" }] } } } } })]);
  if (!entry || !canEditLibraryDraft(user, entry)) notFound();
  const contentLanguage = libraryLanguage(query.lang ?? locale);
  const translation = entry.translations.find((item) => item.language === contentLanguage) ?? null;
  const source = entry.translations.find(item => item.language !== contentLanguage);
  const relatedItems = await relatedItemViews(translation?.relatedItems ?? [], contentLanguage);
  return <ForestPageLayout title={locale === "fr" ? "Modifier le mathématicien" : "Edit mathematician"} meta={<p>{translation?.displayName ?? entry.name}</p>} heroImage="/art/birch-grove.jpg">
    <LibraryTranslationEditorNav baseHref={`/library/mathematicians/${entry.slug}/edit`} locale={locale} activeLanguage={contentLanguage} existingLanguages={entry.translations.map((item) => item.language)} />
    {source && <details className="panel p-4 mb-4"><summary>{locale === "fr" ? `Consulter la version ${source.language.toUpperCase()} pour traduire` : `Read the ${source.language.toUpperCase()} version while translating`}</summary><MarkdownBlock html={source.biographyHtml} /><MarkdownBlock html={source.contributionsHtml} /></details>}
    <MathematicianForm key={contentLanguage} action={saveMathematicianFormAction.bind(null, entry.id)} locale={locale} contentLanguage={contentLanguage} baseUpdatedAt={entry.updatedAt.toISOString()} values={{ ...entry, translation, relatedItems }} />
  </ForestPageLayout>;
}
