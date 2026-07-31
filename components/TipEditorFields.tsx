import { TipImageField } from "@/components/TipImageField";
import { TipProblemPicker, type TipPickerProblem } from "@/components/TipProblemPicker";
import { CONTENT_LIMITS } from "@/lib/content-limits";

type TipEditorFieldsProps = {
  initialProblems: TipPickerProblem[];
  submitLabel: string;
  values: {
    title: string;
    description: string;
    body: string;
    imageUrl: string | null;
    imagePositionX: number;
    imagePositionY: number;
    showInMainMenu: boolean;
  };
};

export function TipEditorFields({ initialProblems, submitLabel, values }: TipEditorFieldsProps) {
  return (
    <>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Title</span>
        <input name="title" maxLength={CONTENT_LIMITS.title} required defaultValue={values.title} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Description</span>
        <textarea
          name="description"
          maxLength={CONTENT_LIMITS.mediumText}
          required
          defaultValue={values.description}
        />
        <span className="muted text-sm">Short summary shown in the Tips library.</span>
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Tip text</span>
        <textarea name="body" maxLength={CONTENT_LIMITS.longNote} rows={7} defaultValue={values.body} />
        <span className="muted text-sm">
          Main text shown in Tip of the Day. Markdown and LaTeX are supported; leave blank to reuse the description.
        </span>
      </label>
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
