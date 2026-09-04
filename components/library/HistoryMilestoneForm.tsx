import { HistoryEra, HistoryMilestoneType } from "@prisma/client";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { LibraryImageFields } from "@/components/library/LibraryImageFields";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { historyEraLabel, milestoneTypeLabel } from "@/lib/library";

type Option = { id: number; label: string };
type Values = {
  sortYear?: number;
  era?: HistoryEra;
  milestoneType?: HistoryMilestoneType;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageCredit?: string | null;
  imageCreditUrl?: string | null;
  imageLicense?: string | null;
  translation?: { yearLabel: string; title: string; summaryMarkdown: string } | null;
  mathematicianIds?: number[];
  referenceIds?: number[];
  conceptIds?: number[];
};

export function HistoryMilestoneForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {}, options }: { action: (data: FormData) => Promise<void>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: Values; options: { mathematicians: Option[]; references: Option[]; concepts: Option[] } }) {
  const fr = locale === "fr";
  return (
    <form action={action} className="panel library-entry-form">
      <input type="hidden" name="language" value={contentLanguage} />
      {baseUpdatedAt && <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} />}
      <div className="library-form-grid">
        <label><span>{fr ? "Titre" : "Title"}</span><input name="title" required defaultValue={values.translation?.title ?? ""} /></label>
        <label><span>{fr ? "Date affichée" : "Displayed date"}</span><input name="yearLabel" required defaultValue={values.translation?.yearLabel ?? ""} placeholder={fr ? "vers 300 av. J.-C." : "c. 300 BCE"} /></label>
        <label><span>{fr ? "Année de tri" : "Sorting year"}</span><input name="sortYear" type="number" min="-5000" max="3000" required defaultValue={values.sortYear ?? ""} /></label>
        <label><span>{fr ? "Période" : "Era"}</span><select name="era" defaultValue={values.era ?? HistoryEra.MODERN}>{Object.values(HistoryEra).map((era) => <option value={era} key={era}>{historyEraLabel(era, locale)}</option>)}</select></label>
        <label><span>{fr ? "Nature du repère" : "Milestone type"}</span><select name="milestoneType" defaultValue={values.milestoneType ?? HistoryMilestoneType.DISCOVERY}>{Object.values(HistoryMilestoneType).map((type) => <option value={type} key={type}>{milestoneTypeLabel(type, locale)}</option>)}</select></label>
      </div>
      <label className="library-editor-field"><span>{fr ? "Récit" : "Story"}</span><MarkdownEditor name="summaryMarkdown" initialValue={values.translation?.summaryMarkdown ?? ""} minHeight="18rem" /></label>
      <details className="library-form-section"><summary>{fr ? "Éléments liés" : "Related entries"}</summary><div className="library-link-selects"><MultiSelect name="mathematicianIds" label={fr ? "Mathématiciens" : "Mathematicians"} options={options.mathematicians} selected={values.mathematicianIds} /><MultiSelect name="referenceIds" label={fr ? "Références" : "References"} options={options.references} selected={values.referenceIds} /><MultiSelect name="conceptIds" label="Concepts" options={options.concepts} selected={values.conceptIds} /></div></details>
      <LibraryImageFields locale={locale} values={values} />
      <LibraryFormActions locale={locale} />
    </form>
  );
}

function MultiSelect({ name, label, options, selected = [] }: { name: string; label: string; options: Option[]; selected?: number[] }) {
  return <label><span>{label}</span><select name={name} multiple size={Math.min(Math.max(options.length, 4), 9)} defaultValue={selected.map(String)}>{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>;
}
