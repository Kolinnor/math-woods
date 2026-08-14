import {
  ACTIVE_CONTENT_LANGUAGES,
  DEFAULT_CONTENT_LANGUAGE,
  KNOWN_CONTENT_LANGUAGES,
  parseContentLanguage
} from "./languages.ts";

export const TRANSLATION_VIEW_LANGUAGE_PARAM = "viewLanguage";
type TranslatableHrefPrefix = "/problems" | "/concepts" | "/explorations" | "/playlists" | "/quotes";

type TranslationEntry = {
  language: string;
  slug?: string;
  isSource?: boolean;
  createdAt?: Date | string;
};

function sourceTranslation<T extends TranslationEntry>(translations: readonly T[]) {
  const explicitSource = translations.find((translation) => translation.isSource);
  if (explicitSource) return explicitSource;

  return [...translations]
    .filter((translation) => translation.createdAt)
    .sort((left, right) => new Date(left.createdAt!).getTime() - new Date(right.createdAt!).getTime())[0];
}

/**
 * Selects the page readers should see without changing the translation lineage.
 * The source remains canonical; English is only the architectural display fallback.
 */
export function selectContentTranslation<T extends TranslationEntry>(
  translations: readonly T[],
  preferredLanguage: string
) {
  const preferred = parseContentLanguage(preferredLanguage);
  return translations.find((translation) => parseContentLanguage(translation.language) === preferred)
    ?? translations.find(
      (translation) => parseContentLanguage(translation.language) === DEFAULT_CONTENT_LANGUAGE
    )
    ?? sourceTranslation(translations)
    ?? translations[0]
    ?? null;
}

export function selectExactContentTranslation<T extends TranslationEntry>(
  translations: readonly T[],
  language: string
) {
  const requested = parseContentLanguage(language);
  return translations.find(
    (translation) => parseContentLanguage(translation.language) === requested
  ) ?? null;
}

export function selectContentTranslationsByGroup<
  T extends TranslationEntry & { translationGroupId: string }
>(translations: readonly T[], preferredLanguage: string) {
  const groups = new Map<string, T[]>();
  for (const translation of translations) {
    groups.set(translation.translationGroupId, [
      ...(groups.get(translation.translationGroupId) ?? []),
      translation
    ]);
  }
  return [...groups.values()].flatMap((group) => {
    const selected = selectContentTranslation(group, preferredLanguage);
    return selected ? [selected] : [];
  });
}

export function selectExactContentTranslationsByGroup<
  T extends TranslationEntry & { translationGroupId: string }
>(translations: readonly T[], language: string) {
  const groups = new Map<string, T[]>();
  for (const translation of translations) {
    groups.set(translation.translationGroupId, [
      ...(groups.get(translation.translationGroupId) ?? []),
      translation
    ]);
  }
  return [...groups.values()].flatMap((group) => {
    const selected = selectExactContentTranslation(group, language);
    return selected ? [selected] : [];
  });
}

export function requestedTranslationLanguage(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return KNOWN_CONTENT_LANGUAGES.some((language) => language.code === normalized)
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

  if (
    ACTIVE_CONTENT_LANGUAGES.some((language) => language.code === preferred) &&
    !existingLanguages.has(preferred)
  ) {
    return preferred;
  }

  return ACTIVE_CONTENT_LANGUAGES.find((language) => !existingLanguages.has(language.code))?.code ?? null;
}
