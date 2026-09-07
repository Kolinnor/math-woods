import { libraryCopy } from "@/lib/library-copy";

export function LibraryFormActions({ locale, saveChanges = false, cancelHref, disabled = false }: { locale: "en" | "fr"; saveChanges?: boolean; cancelHref?: string; disabled?: boolean }) {
  const copy = libraryCopy[locale];
  return (
    <div className="library-form-actions">
      {saveChanges ? <button disabled={disabled} type="submit" name="intent" value="save" className="primary">{locale === "fr" ? "Enregistrer les modifications" : "Save changes"}</button> : <>
        <button disabled={disabled} type="submit" name="intent" value="draft" className="secondary">{copy.saveDraft}</button>
        <button disabled={disabled} type="submit" name="intent" value="submit" className="primary">{copy.submit}</button>
      </>}
      {cancelHref && <a href={cancelHref} className="button secondary">{locale === "fr" ? "Annuler" : "Cancel"}</a>}
    </div>
  );
}
