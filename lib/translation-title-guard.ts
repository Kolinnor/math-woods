export const SAME_TRANSLATION_TITLE_OVERRIDE_FIELD = "allowSameTranslationTitle";

type FormDataReader = {
  get(name: string): FormDataEntryValue | null;
};

export class SameTranslationTitleError extends Error {
  constructor() {
    super("The translation title is identical to the source title.");
  }
}

export function normalizeTranslationTitle(title: string) {
  return title.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function translationTitlesMatch(sourceTitle: string, translatedTitle: string) {
  return normalizeTranslationTitle(sourceTitle) === normalizeTranslationTitle(translatedTitle);
}

export function sameTranslationTitleOverrideRequested(formData: FormDataReader) {
  return formData.get(SAME_TRANSLATION_TITLE_OVERRIDE_FIELD) === "confirm";
}

export function assertTranslationTitleChanged(
  sourceTitle: string,
  translatedTitle: string,
  allowSameTitle: boolean
) {
  if (!allowSameTitle && translationTitlesMatch(sourceTitle, translatedTitle)) {
    throw new SameTranslationTitleError();
  }
}
