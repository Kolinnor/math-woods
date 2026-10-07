import { LibraryEditorBack } from "@/components/library/LibraryEditorBack";
import { LibraryPageLayout } from "@/components/library/LibraryPageLayout";
import { MathematicianForm } from "@/components/library/MathematicianForm";
import { saveMathematicianFormAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";

export default async function NewLibraryMathematicianPage() {
  const [, locale] = await Promise.all([requireAdmin(), getInterfaceLocale()]);
  return <LibraryPageLayout locale={locale} className="library-editor-page" titleBelowHero title={locale === "fr" ? "Ajouter un mathématicien" : "Add a mathematician"}><LibraryEditorBack href="/library/mathematicians" locale={locale} /><MathematicianForm action={saveMathematicianFormAction.bind(null, null)} locale={locale} /></LibraryPageLayout>;
}
