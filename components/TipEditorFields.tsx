import { TipImageField } from "@/components/TipImageField";
import { TipProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { CONTENT_LIMITS } from "@/lib/content-limits";

type TipEditorFieldsProps = {
  draftKey: string;
  initialProblems: TipPickerProblem[];
  submitLabel: string;
  sourceUpdatedAt?: number | null;
  values: {
    title: string;
    body: string;
    imageUrl: string | null;
    imagePositionX: number;
    imagePositionY: number;
    showInMainMenu: boolean;
  };
};

export function TipEditorFields({ draftKey, initialProblems, submitLabel, sourceUpdatedAt = null, values }: TipEditorFieldsProps) {
  return (
    <>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Title</span>
        <input name="title" maxLength={CONTENT_LIMITS.title} required defaultValue={values.title} />
      </label>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Tip text</span>
        <LazyMarkdownEditor
          name="body"
          initialValue={values.body}
          minHeight="12rem"
          draftKey={draftKey}
          sourceUpdatedAt={sourceUpdatedAt}
        />
        <span className="muted text-sm">
          Main text shown in the Tips library and Tip of the Day. Markdown and LaTeX are supported.
        </span>
      </div>
      <TipImageField
        initialImageUrl={values.imageUrl}
        initialPositionX={values.imagePositionX}
        initialPositionY={values.imagePositionY}
      />
      <label className="checkbox-inline">
        <input name="showInMainMenu" type="checkbox" defaultChecked={values.showInMainMenu} />
        <span>Show in the Tip of the Day rotation</span>
      </label>
      <fieldset className="tip-problem-editor">
        <legend>Try this on the following problems</legend>
        <p className="muted text-sm">Choose and order up to 8 problems.</p>
        <TipProblemPicker initialProblems={initialProblems} />
      </fieldset>
      <button type="submit">{submitLabel}</button>
    </>
  );
}
