import { DEFAULT_CONTENT_LANGUAGE, parseActiveContentLanguage } from "./languages.ts";

export type TipTranslationValue = {
  language: string;
  title: string;
  body: string;
};

export function selectTipTranslation(
  translations: readonly TipTranslationValue[],
  preferredLanguage: string,
  fallback: Pick<TipTranslationValue, "title" | "body">
) {
  const preferred = parseActiveContentLanguage(preferredLanguage);
  return translations.find((translation) => translation.language === preferred)
    ?? translations.find((translation) => translation.language === DEFAULT_CONTENT_LANGUAGE)
    ?? translations[0]
    ?? { language: DEFAULT_CONTENT_LANGUAGE, ...fallback };
}

export function tipTranslationValues(
  translations: readonly TipTranslationValue[],
  fallback: Pick<TipTranslationValue, "title" | "body">
) {
  const english = selectTipTranslation(translations, "en", fallback);
  const french = translations.find((translation) => translation.language === "fr");

  return {
    en: { title: english.title, body: english.body },
    fr: { title: french?.title ?? "", body: french?.body ?? "" }
  };
}
