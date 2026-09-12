import { LibraryEditorBack } from "@/components/library/LibraryEditorBack";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ReferenceForm } from "@/components/library/ReferenceForm";
import { saveLibraryReferenceFormAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";

export default async function NewLibraryReferencePage() {
  const [, locale] = await Promise.all([requireAdmin(), getInterfaceLocale()]);
  return <ForestPageLayout className="library-editor-page" titleBelowHero title={locale === "fr" ? "Ajouter une référence" : "Add a reference"} description={locale === "fr" ? "Vérifiez d’abord qu’elle n’existe pas déjà dans le catalogue." : "Please check that it is not already in the catalogue."} heroImage="/art/oak-grove.jpg"><LibraryEditorBack href="/library/references" locale={locale} /><ReferenceForm action={saveLibraryReferenceFormAction.bind(null, null)} locale={locale} /></ForestPageLayout>;
}
