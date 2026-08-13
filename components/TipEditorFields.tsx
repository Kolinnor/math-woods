import { TipImageCollectionField, type TipImageFieldValue } from "@/components/TipImageField";
import { TipProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { CONTENT_LIMITS } from "@/lib/content-limits";

type TipEditorFieldsProps = {
  draftKey: string;
  initialProblems: TipPickerProblem[];
  submitLabel: string;
  sourceUpdatedAt?: number | null;
  values: {
    translations: {
      en: { title: string; body: string };
      fr: { title: string; body: string };
    };
    images: TipImageFieldValue[];
    showInMainMenu: boolean;
  };
};

export function TipEditorFields({ draftKey, initialProblems, submitLabel, sourceUpdatedAt = null, values }: TipEditorFieldsProps) {
  return (
    <>
      <fieldset className="tip-translation-editor">
        <legend>English</legend>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="titleEn" maxLength={CONTENT_LIMITS.title} required defaultValue={values.translations.en.title} />
        </label>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Tip text</span>
          <LazyMarkdownEditor
            name="bodyEn"
            initialValue={values.translations.en.body}
            minHeight="10rem"
            draftKey={`${draftKey}:en`}
            sourceUpdatedAt={sourceUpdatedAt}
          />
        </div>
      </fieldset>
      <fieldset className="tip-translation-editor">
        <legend>Français <span className="muted text-sm">Optional</span></legend>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title</span>
          <input name="titleFr" maxLength={CONTENT_LIMITS.title} defaultValue={values.translations.fr.title} />
        </label>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Tip text</span>
          <LazyMarkdownEditor
            name="bodyFr"
            initialValue={values.translations.fr.body}
            minHeight="10rem"
            draftKey={`${draftKey}:fr`}
            sourceUpdatedAt={sourceUpdatedAt}
          />
        </div>
        <span className="muted text-sm">If left empty, readers using French will see the English version.</span>
      </fieldset>
      <p className="muted text-sm">Markdown and LaTeX are supported in both languages.</p>
      <TipImageCollectionField initialImages={values.images} />
      <label className="checkbox-inline">
        <input name="showInMainMenu" type="checkbox" defaultChecked={values.showInMainMenu} />
        <span>Show in the Tip of the Day rotation</span>
      </label>
      <fieldset className="tip-problem-editor">
        <legend>Try this on the following problems</legend>
        <p className="muted text-sm">Choose and order up to 8 problems.</p>
        <TipProblemPicker initialProblems={initialProblems} deduplicateByTranslationGroup />
      </fieldset>
      <button type="submit">{submitLabel}</button>
    </>
  );
}
