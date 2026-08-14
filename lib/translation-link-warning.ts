export const TRANSLATION_LINK_OVERRIDE_FIELD = "allowMissingTranslationLinks";

type FormDataReader = {
  get(name: string): FormDataEntryValue | null;
};

export function translationLinkOverrideRequested(formData: FormDataReader) {
  return formData.get(TRANSLATION_LINK_OVERRIDE_FIELD) === "confirm";
}
