"use client";

import { startTransition, useActionState, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { PortraitFields } from "@/components/library/PortraitFields";
import { MathematicianNameFields } from "@/components/library/MathematicianNameFields";
import { MathematicianRelatedEditor } from "@/components/library/MathematicianRelatedEditor";
import { FieldHelp } from "@/components/FieldHelp";
import type { MathematicianRelatedView } from "@/lib/mathematician-related";

type MathematicianFormValues = {
  id?: number;
  slug?: string;
  status?: string;
  aliases?: string[];
  name?: string;
  lifespan?: string;
  periodStartYear?: number | null;
  periodEndYear?: number | null;
  portraitUrl?: string | null;
  portraitCrop?: unknown;
  portraitDetails?: string | null;
  imageAlt?: string | null;
  imageCredit?: string | null;
  imageCreditUrl?: string | null;
  imageLicense?: string | null;
  translation?: { displayName: string; sortName?: string; teaser: string; birthPlace: string; biographyMarkdown: string; contributionsMarkdown: string } | null;
  relatedItems?: MathematicianRelatedView[];
};

export function MathematicianForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {} }: { action: (state: { error: string }, data: FormData) => Promise<{ error: string }>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: MathematicianFormValues }) {
  const fr = locale === "fr";
  const translation = values.translation;
  const draftKey = (field: string) => `mathematician:${values.id ?? "new"}:${contentLanguage}:${field}`;
  const [state, submit, pending] = useActionState(action, { error: "" });
  const [portraitUploading, setPortraitUploading] = useState(false);
  return (
    <form onSubmit={event => {
      event.preventDefault();
      if (pending || portraitUploading) return;
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
      <details className="library-form-section"><summary>{fr ? "Portrait et crédits (facultatif)" : "Portrait and credits (optional)"}</summary><div><PortraitFields locale={locale} values={values} onBusyChange={setPortraitUploading} /></div></details>
      <details className="library-form-section"><summary>{fr ? "Classement et période (facultatif)" : "Sorting and period (optional)"}</summary>
        <div className="library-name-label"><span>{fr ? "Repères pour la recherche" : "Browsing information"}</span><FieldHelp text={fr ? "Indiquez les années de naissance et de décès si elles sont connues, sinon les limites de la période d’activité connue. Les années avant J.-C. sont négatives. Une seule année ne représente que ce repère connu. Laissez vide en cas de doute : les dates affichées restent inchangées. Le nom de classement permet de gérer les noms composés, particules et noms historiques sans modifier le nom affiché." : "Use birth and death years when known, otherwise the bounds of the known active period. BCE years are negative. A single year represents only that known point. Leave blank if uncertain: displayed dates stay unchanged. A sort name handles compound, historical and particle names without changing the displayed name."} /></div>
        <div className="library-form-grid"><label><span>{fr ? "Première année connue" : "First known year"}</span><input type="number" name="periodStartYear" min={-3500} max={new Date().getFullYear()} defaultValue={values.periodStartYear ?? ""} /></label><label><span>{fr ? "Dernière année connue" : "Last known year"}</span><input type="number" name="periodEndYear" min={-3500} max={new Date().getFullYear()} defaultValue={values.periodEndYear ?? ""} /></label></div>
        <label><span>{fr ? "Nom de classement" : "Sort name"}</span><input name="sortName" maxLength={160} defaultValue={translation?.sortName ?? ""} placeholder="Noether, Emmy" /></label>
      </details>
      <div><div className="library-name-label"><span>{fr ? "Courte introduction" : "Short introduction"}</span><FieldHelp text={fr ? "Présentez cette personne en quelques phrases. Comme la biographie et les contributions, ce champ accepte Markdown et LaTeX." : "Introduce this person in a few sentences. Like the biography and contributions, this field supports Markdown and LaTeX."} /></div><MarkdownEditor name="teaser" draftKey={draftKey("teaser")} initialValue={translation?.teaser ?? ""} minHeight="5rem" maxLength={1200} /></div>
      <div className="library-editor-field"><span>{fr ? "Biographie" : "Biography"}</span><MarkdownEditor name="biographyMarkdown" ariaLabel={fr ? "Biographie" : "Biography"} draftKey={draftKey("biography")} initialValue={translation?.biographyMarkdown ?? ""} minHeight="18rem" /></div>
      <div className="library-editor-field"><span>{fr ? "Contributions mathématiques" : "Mathematical contributions"}</span><MarkdownEditor name="contributionsMarkdown" ariaLabel={fr ? "Contributions mathématiques" : "Mathematical contributions"} draftKey={draftKey("contributions")} initialValue={translation?.contributionsMarkdown ?? ""} minHeight="14rem" /></div>
      <details className="library-form-section"><summary>{fr ? "Œuvres, sources et liens historiques" : "Works, sources and historical links"}</summary><MathematicianRelatedEditor initial={values.relatedItems} locale={locale} language={contentLanguage} /></details>
      <LibraryFormActions locale={locale} cancelHref={values.slug ? `/library/mathematicians/${values.slug}?lang=${contentLanguage}` : "/library/mathematicians"} disabled={pending || portraitUploading} saveChanges={["PUBLISHED", "PENDING_REVIEW", "ARCHIVED"].includes(values.status ?? "")} />
    </form>
  );
}
