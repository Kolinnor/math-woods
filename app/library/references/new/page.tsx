import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ReferenceForm } from "@/components/library/ReferenceForm";
import { createLibraryReferenceAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";

export default async function NewLibraryReferencePage() {
  const [, locale] = await Promise.all([requireAdmin(), getInterfaceLocale()]);
  return <ForestPageLayout title={locale === "fr" ? "Proposer une référence" : "Suggest a reference"} description={locale === "fr" ? "Vérifiez d’abord qu’elle n’existe pas déjà dans le catalogue." : "Please check that it is not already in the catalogue."} heroImage="/art/oak-grove.jpg"><ReferenceForm action={createLibraryReferenceAction} locale={locale} /></ForestPageLayout>;
}
