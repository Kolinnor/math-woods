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
  aliases?: string[];
  name?: string;
  lifespan?: string;
  portraitUrl?: string | null;
  portraitCrop?: unknown;
  portraitDetails?: string | null;
  imageAlt?: string | null;
  imageCredit?: string | null;
  imageCreditUrl?: string | null;
  imageLicense?: string | null;
  translation?: { displayName: string; teaser: string; birthPlace: string; biographyMarkdown: string; contributionsMarkdown: string } | null;
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
      <PortraitFields locale={locale} values={values} onBusyChange={setPortraitUploading} />
      <div><div className="library-name-label"><span>{fr ? "Courte introduction" : "Short introduction"}</span><FieldHelp text={fr ? "Présentez cette personne en quelques phrases. Comme la biographie et les contributions, ce champ accepte Markdown et LaTeX." : "Introduce this person in a few sentences. Like the biography and contributions, this field supports Markdown and LaTeX."} /></div><MarkdownEditor name="teaser" draftKey={draftKey("teaser")} initialValue={translation?.teaser ?? ""} minHeight="5rem" maxLength={1200} /></div>
      <label className="library-editor-field"><span>{fr ? "Biographie" : "Biography"}</span><MarkdownEditor name="biographyMarkdown" draftKey={draftKey("biography")} initialValue={translation?.biographyMarkdown ?? ""} minHeight="18rem" /></label>
      <label className="library-editor-field"><span>{fr ? "Contributions mathématiques" : "Mathematical contributions"}</span><MarkdownEditor name="contributionsMarkdown" draftKey={draftKey("contributions")} initialValue={translation?.contributionsMarkdown ?? ""} minHeight="14rem" /></label>
      <details className="library-form-section"><summary>{fr ? "Œuvres, sources et liens historiques" : "Works, sources and historical links"}</summary><MathematicianRelatedEditor initial={values.relatedItems} locale={locale} language={contentLanguage} /></details>
      <LibraryFormActions locale={locale} disabled={pending || portraitUploading} />
    </form>
  );
}
