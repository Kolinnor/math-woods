import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { LibraryFormActions } from "@/components/library/LibraryFormActions";
import { LibraryImageFields } from "@/components/library/LibraryImageFields";

type MathematicianFormValues = {
  name?: string;
  lifespan?: string;
  fields?: string[];
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

export function MathematicianForm({ action, locale, contentLanguage = locale, baseUpdatedAt, values = {}, options }: { action: (data: FormData) => Promise<void>; locale: "en" | "fr"; contentLanguage?: "en" | "fr"; baseUpdatedAt?: string; values?: MathematicianFormValues; options: { references: Option[]; concepts: Option[]; problems: Option[] } }) {
  const fr = locale === "fr";
  const translation = values.translation;
  return (
    <form action={action} className="panel library-entry-form">
      <input type="hidden" name="language" value={contentLanguage} />
      {baseUpdatedAt && <input type="hidden" name="baseUpdatedAt" value={baseUpdatedAt} />}
      <div className="library-form-grid">
        <label><span>{fr ? "Nom canonique" : "Canonical name"}</span><input name="canonicalName" required defaultValue={values.name ?? ""} /></label>
        <label><span>{fr ? "Nom affiché dans cette langue" : "Name displayed in this language"}</span><input name="displayName" defaultValue={translation?.displayName ?? ""} /></label>
        <label><span>{fr ? "Dates" : "Dates"}</span><input name="lifespan" defaultValue={values.lifespan ?? ""} placeholder="1877–1947" /></label>
        <label><span>{fr ? "Lieu de naissance" : "Birthplace"}</span><input name="birthPlace" defaultValue={translation?.birthPlace ?? ""} /></label>
        <label><span>{fr ? "Domaines" : "Fields"}</span><input name="fields" defaultValue={values.fields?.join(", ") ?? ""} placeholder={fr ? "algèbre, géométrie" : "algebra, geometry"} /></label>
      </div>
      <label><span>{fr ? "Courte introduction" : "Short introduction"}</span><textarea name="teaser" rows={3} defaultValue={translation?.teaser ?? ""} /></label>
      <label className="library-editor-field"><span>{fr ? "Biographie" : "Biography"}</span><MarkdownEditor name="biographyMarkdown" initialValue={translation?.biographyMarkdown ?? ""} minHeight="18rem" /></label>
      <label className="library-editor-field"><span>{fr ? "Contributions mathématiques" : "Mathematical contributions"}</span><MarkdownEditor name="contributionsMarkdown" initialValue={translation?.contributionsMarkdown ?? ""} minHeight="14rem" /></label>
      <details className="library-form-section"><summary>{fr ? "Œuvres et contributions liées" : "Related works and contributions"}</summary><div className="library-link-selects"><MultiSelect name="referenceIds" label={fr ? "Œuvres et références" : "Works and references"} options={options.references} selected={values.referenceIds} /><MultiSelect name="conceptIds" label="Concepts" options={options.concepts} selected={values.conceptIds} /><MultiSelect name="problemIds" label={fr ? "Problèmes" : "Problems"} options={options.problems} selected={values.problemIds} /></div></details>
      <LibraryImageFields locale={locale} values={{ imageUrl: values.portraitUrl, imageAlt: values.imageAlt, imageCredit: values.imageCredit, imageCreditUrl: values.imageCreditUrl, imageLicense: values.imageLicense }} />
      <LibraryFormActions locale={locale} />
    </form>
  );
}

function MultiSelect({ name, label, options, selected = [] }: { name: string; label: string; options: Option[]; selected?: number[] }) {
  return <label><span>{label}</span><select name={name} multiple size={Math.min(Math.max(options.length, 4), 9)} defaultValue={selected.map(String)}>{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>;
}
