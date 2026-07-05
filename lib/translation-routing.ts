import { parseContentLanguage, SUPPORTED_CONTENT_LANGUAGES } from "./languages.ts";

type TranslationEntry = {
  language: string;
  slug?: string;
};

export function translationLanguageSet(currentLanguage: string, translations: readonly TranslationEntry[]) {
  return new Set([parseContentLanguage(currentLanguage), ...translations.map((item) => parseContentLanguage(item.language))]);
}

export function preferredTranslationForLanguage(
  currentLanguage: string,
  translations: readonly TranslationEntry[],
  preferredLanguage: string
) {
  const current = parseContentLanguage(currentLanguage);
  const preferred = parseContentLanguage(preferredLanguage);
  if (preferred === current) return null;

  return translations.find((translation) => parseContentLanguage(translation.language) === preferred) ?? null;
}

export function nextMissingTranslationLanguage(
  currentLanguage: string,
  translations: readonly TranslationEntry[],
  preferredLanguage: string
) {
  const existingLanguages = translationLanguageSet(currentLanguage, translations);
  const preferred = parseContentLanguage(preferredLanguage);

  if (!existingLanguages.has(preferred)) return preferred;

  return SUPPORTED_CONTENT_LANGUAGES.find((language) => !existingLanguages.has(language.code))?.code ?? null;
}
