import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MathematicianForm } from "@/components/library/MathematicianForm";
import { saveMathematicianFormAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";

export default async function NewLibraryMathematicianPage() {
  const [, locale] = await Promise.all([requireAdmin(), getInterfaceLocale()]);
  return <ForestPageLayout title={locale === "fr" ? "Ajouter un(e) mathématicien(ne)" : "Add a mathematician"} heroImage="/art/birch-grove.jpg"><MathematicianForm action={saveMathematicianFormAction.bind(null, null)} locale={locale} /></ForestPageLayout>;
}
