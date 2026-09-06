import { libraryCopy } from "@/lib/library-copy";

export function LibraryFormActions({ locale, saveChanges = false, cancelHref }: { locale: "en" | "fr"; saveChanges?: boolean; cancelHref?: string }) {
  const copy = libraryCopy[locale];
  return (
    <div className="library-form-actions">
      {saveChanges ? <button type="submit" name="intent" value="save" className="primary">{locale === "fr" ? "Enregistrer les modifications" : "Save changes"}</button> : <>
        <button type="submit" name="intent" value="draft" className="secondary">{copy.saveDraft}</button>
        <button type="submit" name="intent" value="submit" className="primary">{copy.submit}</button>
      </>}
      {cancelHref && <a href={cancelHref} className="button secondary">{locale === "fr" ? "Annuler" : "Cancel"}</a>}
    </div>
  );
}
