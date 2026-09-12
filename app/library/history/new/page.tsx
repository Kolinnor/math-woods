import { LibraryEditorBack } from "@/components/library/LibraryEditorBack";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { HistoryMilestoneForm } from "@/components/library/HistoryMilestoneForm";
import { saveHistoryMilestoneFormAction } from "@/lib/actions/library-actions";
import { requireAdmin } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryFormOptions } from "@/lib/library-queries";

export default async function NewHistoryMilestonePage() {
  const [, locale, rawOptions] = await Promise.all([requireAdmin(), getInterfaceLocale(), libraryFormOptions()]);
  const options = { mathematicians: rawOptions.mathematicians.map((item) => ({ id: item.id, label: item.name })), references: rawOptions.references.map((item) => ({ id: item.id, label: item.canonicalTitle })), concepts: rawOptions.concepts.map((item) => ({ id: item.id, label: item.title })) };
  return <ForestPageLayout className="library-editor-page" titleBelowHero title={locale === "fr" ? "Ajouter un repère historique" : "Add a historical milestone"} heroImage="/art/brook-in-the-forest.jpg"><LibraryEditorBack href="/library/history" locale={locale} /><HistoryMilestoneForm action={saveHistoryMilestoneFormAction.bind(null, null)} locale={locale} options={options} /></ForestPageLayout>;
}
