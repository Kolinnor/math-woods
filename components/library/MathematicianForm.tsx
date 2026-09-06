"use client";

import { startTransition, useActionState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { LibraryImageFields } from "@/components/library/LibraryImageFields";
import { MathematicianNameFields } from "@/components/library/MathematicianNameFields";

type MathematicianFormValues = {
  id?: number;
  aliases?: string[];
  name?: string;
  lifespan?: string;
  portraitUrl?: string | null;
  imageAlt?: string | null;
  imageCredit?: string | null;
  imageCreditUrl?: string | null;
  imageLicense?: string | null;
  translation?: { displayName: string; teaser: string; birthPlace: string; biographyMarkdown: string; contributionsMarkdown: string } | null;
  referenceIds?: number[];
  conceptIds?: number[];
  problemIds?: number[];
};

type Option = { id: number; label: string };

export function MathematicianForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {}, options }: { action: (state: { error: string }, data: FormData) => Promise<{ error: string }>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: MathematicianFormValues; options: { references: Option[]; concepts: Option[]; problems: Option[] } }) {
  const fr = locale === "fr";
  const translation = values.translation;
  const [state, submit, pending] = useActionState(action, { error: "" });
  return (
    <form onSubmit={event => {
      event.preventDefault();
      if (pending) return;
      const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
      startTransition(() => submit(data));
    }} className="panel library-entry-form" aria-busy={pending}>
      {state.error && <p role="alert" className="quality-banner">{state.error}</p>}
      <input type="hidden" name="language" value={contentLanguage} />
      {baseUpdatedAt && <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} />}
      <MathematicianNameFields key={contentLanguage} locale={locale} language={contentLanguage} initialName={translation?.displayName || values.name || ""} aliases={values.aliases} excludeId={values.id} />
      <div className="library-form-grid">
        <label><span>{fr ? "Dates" : "Dates"}</span><input name="lifespan" defaultValue={values.lifespan ?? ""} placeholder="1877–1947" /></label>
        <label><span>{fr ? "Lieu de naissance" : "Birthplace"}</span><input name="birthPlace" defaultValue={translation?.birthPlace ?? ""} /></label>
      </div>
      <LibraryImageFields portrait locale={locale} values={{ imageUrl: values.portraitUrl, imageAlt: values.imageAlt, imageCredit: values.imageCredit, imageCreditUrl: values.imageCreditUrl, imageLicense: values.imageLicense }} />
      <label><span>{fr ? "Courte introduction" : "Short introduction"}</span><textarea name="teaser" rows={3} defaultValue={translation?.teaser ?? ""} /></label>
      <label className="library-editor-field"><span>{fr ? "Biographie" : "Biography"}</span><MarkdownEditor name="biographyMarkdown" initialValue={translation?.biographyMarkdown ?? ""} minHeight="18rem" /></label>
      <label className="library-editor-field"><span>{fr ? "Contributions mathématiques" : "Mathematical contributions"}</span><MarkdownEditor name="contributionsMarkdown" initialValue={translation?.contributionsMarkdown ?? ""} minHeight="14rem" /></label>
      <details className="library-form-section"><summary>{fr ? "Œuvres et contributions liées" : "Related works and contributions"}</summary><div className="library-link-selects"><MultiSelect name="referenceIds" label={fr ? "Œuvres et références" : "Works and references"} options={options.references} selected={values.referenceIds} /><MultiSelect name="conceptIds" label="Concepts" options={options.concepts} selected={values.conceptIds} /><MultiSelect name="problemIds" label={fr ? "Problèmes" : "Problems"} options={options.problems} selected={values.problemIds} /></div></details>
      <LibraryFormActions locale={locale} />
    </form>
  );
}

function MultiSelect({ name, label, options, selected = [] }: { name: string; label: string; options: Option[]; selected?: number[] }) {
  return <label><span>{label}</span><select name={name} multiple size={Math.min(Math.max(options.length, 4), 9)} defaultValue={selected.map(String)}>{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>;
}
