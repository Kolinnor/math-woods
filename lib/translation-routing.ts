import { parseContentLanguage, SUPPORTED_CONTENT_LANGUAGES } from "./languages.ts";

export const TRANSLATION_VIEW_LANGUAGE_PARAM = "viewLanguage";
type TranslatableHrefPrefix = "/problems" | "/concepts" | "/explorations" | "/playlists" | "/quotes";

type TranslationEntry = {
  language: string;
  slug?: string;
};

export function requestedTranslationLanguage(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SUPPORTED_CONTENT_LANGUAGES.some((language) => language.code === normalized)
    ? parseContentLanguage(normalized)
    : null;
}

export function contentLanguageViewHref(
  hrefPrefix: TranslatableHrefPrefix,
  slug: string,
  language: string,
  extraParams: Record<string, string | number | undefined> = {}
) {
  const query = new URLSearchParams();
  query.set(TRANSLATION_VIEW_LANGUAGE_PARAM, parseContentLanguage(language));
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `${hrefPrefix}/${slug}?${query.toString()}`;
}

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
