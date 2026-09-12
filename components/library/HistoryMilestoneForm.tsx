"use client";

import { startTransition, useActionState, useState } from "react";
import { HistoryEra, HistoryMilestoneType } from "@prisma/client";
import { FieldHelp } from "@/components/FieldHelp";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { LibraryImageFields } from "@/components/library/LibraryImageFields";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { historyEraLabel, milestoneTypeLabel } from "@/lib/library";

type Option = { id: number; label: string };
type Values = {
  status?: string;
  slug?: string;
  sortYear?: number;
  endYear?: number | null;
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

export function HistoryMilestoneForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {}, options }: { action: (state: { error: string }, data: FormData) => Promise<{ error: string }>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: Values; options: { mathematicians: Option[]; references: Option[]; concepts: Option[] } }) {
  const fr = locale === "fr";
  const [milestoneType, setMilestoneType] = useState(values.milestoneType ?? HistoryMilestoneType.DISCOVERY);
  const [startYear, setStartYear] = useState(String(values.sortYear ?? ""));
  const [imageUploading, setImageUploading] = useState(false);
  const [state, submit, pending] = useActionState(action, { error: "" });
  const isPeriod = milestoneType === HistoryMilestoneType.PERIOD;
  const storyLabel = isPeriod ? (fr ? "Présentation de la période" : "Period overview") : (fr ? "Récit" : "Story");
  return (
    <form onSubmit={event => {
      event.preventDefault();
      if (pending || imageUploading) return;
      // Explicit dispatch preserves uncontrolled inputs when validation fails.
      const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
      startTransition(() => submit(data));
    }} className="panel library-entry-form history-milestone-form" aria-busy={pending}>
      {state.error && <p role="alert" className="quality-banner">{state.error}</p>}
      <input type="hidden" name="language" value={contentLanguage} />
      {baseUpdatedAt && <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} />}
      <div className="library-form-grid">
        <label><span>{fr ? "Titre" : "Title"}</span><input name="title" required defaultValue={values.translation?.title ?? ""} /></label>
        <label><span>{fr ? "Nature du repère" : "Milestone type"}</span><select name="milestoneType" value={milestoneType} onChange={(event) => setMilestoneType(event.target.value as HistoryMilestoneType)}>{Object.values(HistoryMilestoneType).map((type) => <option value={type} key={type}>{milestoneTypeLabel(type, locale)}</option>)}</select></label>
        <label><span className="field-label-with-help">{isPeriod ? (fr ? "Dates affichées" : "Displayed dates") : (fr ? "Date affichée" : "Displayed date")} <FieldHelp text={fr ? "Écrivez les dates comme vous souhaitez les afficher, par exemple « 323–31 av. J.-C. », « vers 300 av. J.-C. » ou « IIIᵉ siècle av. J.-C. ». Les limites d’une période peuvent être approximatives." : "Write the dates as you want them displayed, for example ‘323–31 BCE’, ‘c. 300 BCE’ or ‘3rd century BCE’. The boundaries of a period may be approximate."} /></span><input name="yearLabel" required defaultValue={values.translation?.yearLabel ?? ""} placeholder={isPeriod ? (fr ? "323–31 av. J.-C." : "323–31 BCE") : (fr ? "vers 300 av. J.-C." : "c. 300 BCE")} /></label>
        <label><span className="field-label-with-help">{isPeriod ? (fr ? "Année de début" : "Start year") : (fr ? "Année de tri" : "Sorting year")} <FieldHelp text={fr ? "Cette année sert à placer le repère dans la chronologie. Utilisez un nombre négatif avant J.-C. : −323 pour 323 av. J.-C. Une estimation suffit si la date exacte est inconnue." : "This year positions the entry in the timeline. Use a negative number for BCE: −323 for 323 BCE. An estimate is enough if the exact date is unknown."} /></span><input name="sortYear" type="number" min="-5000" max="3000" required value={startYear} onChange={(event) => setStartYear(event.target.value)} /></label>
        <label hidden={!isPeriod} style={!isPeriod ? { display: "none" } : undefined}><span>{fr ? "Année de fin (facultative)" : "End year (optional)"}</span><input name="endYear" type="number" min={startYear || -5000} max="3000" disabled={!isPeriod} defaultValue={values.endYear ?? ""} /></label>
        <label><span>{fr ? "Grande époque" : "Historical era"}</span><select name="era" defaultValue={values.era ?? HistoryEra.MODERN}>{Object.values(HistoryEra).map((era) => <option value={era} key={era}>{historyEraLabel(era, locale)}</option>)}</select></label>
      </div>
      <div className="library-editor-field"><span>{storyLabel}</span><MarkdownEditor name="summaryMarkdown" ariaLabel={storyLabel} initialValue={values.translation?.summaryMarkdown ?? ""} minHeight="18rem" /></div>
      <details className="library-form-section"><summary>{fr ? "Éléments liés" : "Related entries"}</summary><div className="library-link-selects"><MultiSelect name="mathematicianIds" label={fr ? "Mathématiciens" : "Mathematicians"} options={options.mathematicians} selected={values.mathematicianIds} /><MultiSelect name="referenceIds" label={fr ? "Références" : "References"} options={options.references} selected={values.referenceIds} /><MultiSelect name="conceptIds" label="Concepts" options={options.concepts} selected={values.conceptIds} /></div></details>
      <details className="library-form-section"><summary>{fr ? "Image et crédits (facultatif)" : "Image and credits (optional)"}</summary><div><LibraryImageFields locale={locale} values={values} landscape onUploadingChange={setImageUploading} /></div></details>
      <LibraryFormActions locale={locale} cancelHref={values.slug ? `/library/history/${values.slug}?lang=${contentLanguage}` : "/library/history"} disabled={pending || imageUploading} saveChanges={["PUBLISHED", "PENDING_REVIEW", "ARCHIVED"].includes(values.status ?? "")} />
    </form>
  );
}

function MultiSelect({ name, label, options, selected = [] }: { name: string; label: string; options: Option[]; selected?: number[] }) {
  return <label><span>{label}</span><select name={name} multiple size={Math.min(Math.max(options.length, 4), 9)} defaultValue={selected.map(String)}>{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>;
}
