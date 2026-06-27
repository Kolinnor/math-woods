export const CONTENT_LANGUAGE_COOKIE = "math-woods-language";
export const DEFAULT_CONTENT_LANGUAGE = "en";

export type ContentLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
};

export const SUPPORTED_CONTENT_LANGUAGES: ContentLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French", nativeLabel: "Francais" },
  { code: "es", label: "Spanish", nativeLabel: "Espanol" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "pt", label: "Portuguese", nativeLabel: "Portugues" }
];

const supportedLanguageCodes = new Set(SUPPORTED_CONTENT_LANGUAGES.map((language) => language.code));

export function parseContentLanguage(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return supportedLanguageCodes.has(normalized) ? normalized : DEFAULT_CONTENT_LANGUAGE;
}

export function contentLanguageLabel(code: string) {
  return SUPPORTED_CONTENT_LANGUAGES.find((language) => language.code === code)?.label ?? code.toUpperCase();
}

export function contentLanguageNativeLabel(code: string) {
  return SUPPORTED_CONTENT_LANGUAGES.find((language) => language.code === code)?.nativeLabel ?? code.toUpperCase();
}

export function parseTranslationGroupId(value: unknown) {
  const raw = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(raw) ? raw : "";
}
