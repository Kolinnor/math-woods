import { libraryCopy } from "@/lib/library-copy";

export function LibraryFormActions({ locale }: { locale: "en" | "fr" }) {
  const copy = libraryCopy[locale];
  return (
    <div className="library-form-actions">
      <button type="submit" name="intent" value="draft" className="secondary">{copy.saveDraft}</button>
      <button type="submit" name="intent" value="submit" className="primary">{copy.submit}</button>
    </div>
  );
}
