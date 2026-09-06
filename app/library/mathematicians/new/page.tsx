import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MathematicianForm } from "@/components/library/MathematicianForm";
import { saveMathematicianFormAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryFormOptions } from "@/lib/library-queries";

export default async function NewLibraryMathematicianPage() {
  const [, locale, rawOptions] = await Promise.all([requireAdmin(), getInterfaceLocale(), libraryFormOptions()]);
  const options = { references: rawOptions.references.map((item) => ({ id: item.id, label: item.canonicalTitle })), concepts: rawOptions.concepts.map((item) => ({ id: item.id, label: item.title })), problems: rawOptions.problems.map((item) => ({ id: item.id, label: item.title })) };
  return <ForestPageLayout title={locale === "fr" ? "Ajouter un(e) mathématicien(ne)" : "Add a mathematician"} heroImage="/art/birch-grove.jpg"><MathematicianForm action={saveMathematicianFormAction.bind(null, null)} locale={locale} options={options} /></ForestPageLayout>;
}
