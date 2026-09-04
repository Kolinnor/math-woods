import { LibraryReferenceType } from "@prisma/client";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { LibraryReferenceIconField } from "@/components/library/LibraryReferenceIconField";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { referenceTypeLabel } from "@/lib/library";

type ReferenceFormValues = {
  canonicalTitle?: string;
  referenceType?: LibraryReferenceType;
  authors?: string | null;
  publisher?: string | null;
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

export function ReferenceForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {} }: { action: (data: FormData) => Promise<void>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: ReferenceFormValues }) {
  const fr = locale === "fr";
  return (
    <form action={action} className="panel library-entry-form">
      <input type="hidden" name="language" value={contentLanguage} />
      {baseUpdatedAt && <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} />}
      <div className="library-form-grid">
        <label><span>{fr ? "Titre canonique" : "Canonical title"}</span><input name="canonicalTitle" required defaultValue={values.canonicalTitle ?? ""} /></label>
        <label><span>{fr ? "Titre affiché dans cette langue" : "Title displayed in this language"}</span><input name="displayTitle" defaultValue={values.translation?.displayTitle ?? values.canonicalTitle ?? ""} /></label>
        <label><span>{fr ? "Type" : "Type"}</span><select name="referenceType" defaultValue={values.referenceType ?? LibraryReferenceType.BOOK}>{Object.values(LibraryReferenceType).map((type) => <option key={type} value={type}>{referenceTypeLabel(type, locale)}</option>)}</select></label>
        <label><span>{fr ? "Auteurs ou créateur" : "Authors or creator"}</span><input name="authors" defaultValue={values.authors ?? ""} /></label>
        <label><span>{fr ? "Éditeur" : "Publisher"}</span><input name="publisher" defaultValue={values.publisher ?? ""} /></label>
        <label><span>{fr ? "Année" : "Year"}</span><input name="year" type="number" min="-5000" max="3000" defaultValue={values.year ?? ""} /></label>
        <label><span>{fr ? "Date affichée" : "Displayed date"}</span><input name="yearLabel" defaultValue={values.yearLabel ?? ""} /></label>
        <label><span>URL</span><input name="url" type="url" defaultValue={values.url ?? ""} /></label>
        <label><span>DOI</span><input name="doi" defaultValue={values.doi ?? ""} /></label>
        <label><span>ISBN</span><input name="isbn" defaultValue={values.isbn ?? ""} /></label>
        <label><span>{fr ? "Clé de citation" : "Citation key"}</span><input name="citationKey" defaultValue={values.citationKey ?? ""} /></label>
      </div>
      <label><span>{fr ? "Citation affichée personnalisée" : "Custom displayed citation"}</span><textarea name="formattedOverride" rows={2} defaultValue={values.formattedOverride ?? ""} /></label>
      <label><span>{fr ? "Alias, un par ligne" : "Aliases, one per line"}</span><textarea name="aliases" rows={3} defaultValue={values.aliases?.join("\n") ?? ""} /></label>
      <label className="library-editor-field"><span>{fr ? "Présentation" : "Description"}</span><MarkdownEditor name="descriptionMarkdown" initialValue={values.translation?.descriptionMarkdown ?? ""} minHeight="14rem" /></label>
      <details className="library-form-section"><summary>{fr ? "Citation structurée et pictogramme" : "Structured citation and pictogram"}</summary><div><label><span>BibTeX</span><textarea name="bibtex" rows={7} defaultValue={values.bibtex ?? ""} /></label><LibraryReferenceIconField locale={locale} title={values.canonicalTitle ?? ""} initialUrl={values.iconUrl} initialSize={values.iconSize} /><div className="library-form-grid"><label><span>{fr ? "Description du pictogramme" : "Pictogram description"}</span><input name="imageAlt" defaultValue={values.imageAlt ?? ""} /></label><label><span>{fr ? "Crédit du pictogramme" : "Pictogram credit"}</span><input name="imageCredit" defaultValue={values.imageCredit ?? ""} /></label><label><span>{fr ? "Lien du crédit" : "Credit URL"}</span><input name="imageCreditUrl" type="url" defaultValue={values.imageCreditUrl ?? ""} /></label><label><span>{fr ? "Licence" : "License"}</span><input name="imageLicense" defaultValue={values.imageLicense ?? ""} /></label></div></div></details>
      <LibraryFormActions locale={locale} />
    </form>
  );
}
