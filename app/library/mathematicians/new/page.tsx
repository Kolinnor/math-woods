import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MathematicianForm } from "@/components/library/MathematicianForm";
import { createMathematicianAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryFormOptions } from "@/lib/library-queries";

export default async function NewLibraryMathematicianPage() {
  const [, locale, rawOptions] = await Promise.all([requireAdmin(), getInterfaceLocale(), libraryFormOptions()]);
  const options = { references: rawOptions.references.map((item) => ({ id: item.id, label: item.canonicalTitle })), concepts: rawOptions.concepts.map((item) => ({ id: item.id, label: item.title })), problems: rawOptions.problems.map((item) => ({ id: item.id, label: item.title })) };
  return <ForestPageLayout title={locale === "fr" ? "Proposer un mathématicien" : "Suggest a mathematician"} description={locale === "fr" ? "La fiche sera enregistrée comme brouillon ou envoyée en relecture." : "The entry can be saved as a draft or submitted for review."} heroImage="/art/birch-grove.jpg"><MathematicianForm action={createMathematicianAction} locale={locale} options={options} /></ForestPageLayout>;
}
