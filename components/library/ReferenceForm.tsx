"use client";

import { startTransition, useActionState } from "react";
import { LibraryReferenceType } from "@prisma/client";
import { ReferenceWorkPicker, ReferenceBibtexField } from "@/components/library/ReferenceBibliographyFields";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { LibraryReferenceIconField } from "@/components/library/LibraryReferenceIconField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { referenceTypeLabel } from "@/lib/library";

type ReferenceFormValues = {
  id?: number;
  canonicalTitle?: string;
  referenceType?: LibraryReferenceType;
  authors?: string | null;
  publisher?: string | null;
  edition?: string | null;
  volume?: string | null;
  translator?: string | null;
  editors?: string | null;
  journal?: string | null;
  issue?: string | null;
  pages?: string | null;
  work?: { id: number; canonicalTitle: string } | null;
  year?: number | null;
  yearLabel?: string | null;
  url?: string | null;
  doi?: string | null;
  isbn?: string | null;
  citationKey?: string | null;
  bibtex?: string | null;
  formattedOverride?: string | null;
  aliases?: string[];
  iconUrl?: string | null;
  iconSize?: number;
  imageAlt?: string | null;
  imageCredit?: string | null;
  imageCreditUrl?: string | null;
  imageLicense?: string | null;
  translation?: { displayTitle: string | null; descriptionMarkdown: string } | null;
};

export function ReferenceForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {} }: { action: (state: { error: string }, data: FormData) => Promise<{ error: string }>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: ReferenceFormValues }) {
  const fr = locale === "fr";
  const [state, submit, pending] = useActionState(action, { error: "" });
  return (
    <form onSubmit={event => {
      event.preventDefault();
      // Dispatch explicitly: React form actions otherwise reset uncontrolled fields
      // even when the server returns a validation error. Success redirects away.
      const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
      startTransition(() => submit(data));
    }} className="panel library-entry-form library-reference-form">
      {state.error && <p role="alert" className="quality-banner">{state.error}</p>}
      <input type="hidden" name="language" value={contentLanguage} />
      {baseUpdatedAt && <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} />}
      <div className="library-form-grid">
        <label><span>{fr ? "Titre" : "Title"}</span><input name="canonicalTitle" required defaultValue={values.canonicalTitle ?? ""} /></label>
        <label><span>{fr ? "Type" : "Type"}</span><select name="referenceType" defaultValue={values.referenceType ?? LibraryReferenceType.BOOK}>{Object.values(LibraryReferenceType).map((type) => <option key={type} value={type}>{referenceTypeLabel(type, locale)}</option>)}</select></label>
        <label><span>{fr ? "Auteurs ou créateur" : "Authors or creator"}</span><textarea name="authors" rows={2} defaultValue={values.authors ?? ""} placeholder={fr ? "Un auteur par ligne" : "One author per line"} /></label>
        <label><span>{fr ? "Lien (facultatif)" : "Link (optional)"}</span><input name="url" type="url" defaultValue={values.url ?? ""} /></label>
      </div>
      <p className="muted">{fr ? "Ces informations suffisent pour commencer. Complétez les détails ci-dessous seulement si vous les connaissez." : "This is enough to get started. Add details below only if you know them."}</p>
      <details className="library-form-section"><summary>{fr ? "Édition et bibliographie" : "Edition and bibliography"}</summary><div>
        <ReferenceWorkPicker locale={locale} initial={values.work ?? null} excludeId={values.id} />
        <p className="muted">{fr ? "Une œuvre peut avoir plusieurs éditions ou traductions. Le livre interne, chapitre ou passage cité se précise sur le problème (ex. : Livre I, proposition 10)." : "A work can have several editions or translations. Specify the internal book, chapter or passage on the problem (e.g. Book I, proposition 10)."}</p>
        <div className="library-form-grid">
        <label><span>{fr ? "Édition" : "Edition"}</span><input name="edition" defaultValue={values.edition ?? ""} placeholder={fr ? "Ex. : 2e édition" : "E.g. Second edition"} /></label>
        <label><span>{fr ? "Volume publié" : "Published volume"}</span><input name="volume" defaultValue={values.volume ?? ""} /></label>
        <label><span>{fr ? "Traducteurs, un par ligne" : "Translators, one per line"}</span><textarea name="translator" rows={2} defaultValue={values.translator ?? ""} /></label>
        <label><span>{fr ? "Responsables de l’édition, un par ligne" : "Editors, one per line"}</span><textarea name="editors" rows={2} defaultValue={values.editors ?? ""} /></label>
        <label><span>{fr ? "Éditeur" : "Publisher"}</span><input name="publisher" defaultValue={values.publisher ?? ""} /></label>
        <label><span>{fr ? "Année" : "Year"}</span><input name="year" type="number" min="-5000" max="3000" defaultValue={values.year ?? ""} /></label>
        <label><span>{fr ? "Date affichée" : "Displayed date"}</span><input name="yearLabel" defaultValue={values.yearLabel ?? ""} /></label>
        <label><span>{fr ? "Revue" : "Journal"}</span><input name="journal" defaultValue={values.journal ?? ""} /></label>
        <label><span>{fr ? "Numéro de revue" : "Journal issue"}</span><input name="issue" defaultValue={values.issue ?? ""} /></label>
        <label><span>{fr ? "Pages de l’article ou du chapitre" : "Article or chapter pages"}</span><input name="pages" defaultValue={values.pages ?? ""} placeholder="123--145" /></label>
        </div>
      </div></details>
      <details className="library-form-section"><summary>{fr ? "BibTeX et identifiants" : "BibTeX and identifiers"}</summary><div>
        <div className="library-form-grid">
        <label><span>DOI</span><input name="doi" defaultValue={values.doi ?? ""} /></label>
        <label><span>ISBN</span><input name="isbn" defaultValue={values.isbn ?? ""} /></label>
        <label><span>{fr ? "Clé de citation" : "Citation key"}</span><input name="citationKey" defaultValue={values.citationKey ?? ""} /></label>
        </div>
        <ReferenceBibtexField locale={locale} initialValue={values.bibtex ?? ""} />
      </div></details>
      <details className="library-form-section"><summary>{fr ? "Présentation personnalisée" : "Custom presentation"}</summary><div>
      <label><span>{fr ? "Titre affiché dans cette langue" : "Title displayed in this language"}</span><input name="displayTitle" defaultValue={values.translation?.displayTitle ?? ""} /></label>
      <label><span>{fr ? "Citation affichée personnalisée" : "Custom displayed citation"}</span><textarea name="formattedOverride" rows={2} defaultValue={values.formattedOverride ?? ""} /></label>
      <label><span>{fr ? "Alias, un par ligne" : "Aliases, one per line"}</span><textarea name="aliases" rows={3} defaultValue={values.aliases?.join("\n") ?? ""} /></label>
      <label className="library-editor-field"><span>{fr ? "Présentation" : "Description"}</span><MarkdownEditor name="descriptionMarkdown" initialValue={values.translation?.descriptionMarkdown ?? ""} minHeight="14rem" /></label>
      </div></details>
      <details className="library-form-section"><summary>{fr ? "Pictogramme et crédits" : "Pictogram and credits"}</summary><div><LibraryReferenceIconField locale={locale} title={values.canonicalTitle ?? ""} initialUrl={values.iconUrl} initialSize={values.iconSize} /><div className="library-form-grid"><label><span>{fr ? "Description du pictogramme" : "Pictogram description"}</span><input name="imageAlt" defaultValue={values.imageAlt ?? ""} /></label><label><span>{fr ? "Crédit du pictogramme" : "Pictogram credit"}</span><input name="imageCredit" defaultValue={values.imageCredit ?? ""} /></label><label><span>{fr ? "Lien du crédit" : "Credit URL"}</span><input name="imageCreditUrl" type="url" defaultValue={values.imageCreditUrl ?? ""} /></label><label><span>{fr ? "Licence" : "License"}</span><input name="imageLicense" defaultValue={values.imageLicense ?? ""} /></label></div></div></details>
      <fieldset disabled={pending} style={{ border: 0, padding: 0 }}><LibraryFormActions locale={locale} /></fieldset>
    </form>
  );
}
