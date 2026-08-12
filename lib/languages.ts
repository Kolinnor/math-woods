export const CONTENT_LANGUAGE_COOKIE = "math-woods-language";
// Architectural display fallback only. A translation group's canonical source may use any language.
export const DEFAULT_CONTENT_LANGUAGE = "en";

export type ContentLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
};

export const ACTIVE_CONTENT_LANGUAGES: ContentLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French", nativeLabel: "Francais" }
];

export const FUTURE_CONTENT_LANGUAGES: ContentLanguage[] = [
  { code: "es", label: "Spanish", nativeLabel: "Espanol" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "pt", label: "Portuguese", nativeLabel: "Portugues" }
];

export const KNOWN_CONTENT_LANGUAGES: ContentLanguage[] = [
  ...ACTIVE_CONTENT_LANGUAGES,
  ...FUTURE_CONTENT_LANGUAGES
];

const knownLanguageCodes = new Set(KNOWN_CONTENT_LANGUAGES.map((language) => language.code));
const activeLanguageCodes = new Set(ACTIVE_CONTENT_LANGUAGES.map((language) => language.code));

export function parseContentLanguage(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return knownLanguageCodes.has(normalized) ? normalized : DEFAULT_CONTENT_LANGUAGE;
}

export function isActiveContentLanguage(value: unknown) {
  return activeLanguageCodes.has(String(value ?? "").trim().toLowerCase());
}

export function parseActiveContentLanguage(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return activeLanguageCodes.has(normalized) ? normalized : DEFAULT_CONTENT_LANGUAGE;
}

export function requireActiveContentLanguage(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!activeLanguageCodes.has(normalized)) {
    throw new Error("Math Woods currently accepts new content in English and French only.");
  }
  return normalized;
}

export function editableContentLanguage(value: unknown, existingLanguage: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const existing = parseContentLanguage(existingLanguage);
  if (activeLanguageCodes.has(normalized) || normalized === existing) return normalized;
  throw new Error("Math Woods currently accepts new content in English and French only.");
}

export function contentLanguageLabel(code: string) {
  return KNOWN_CONTENT_LANGUAGES.find((language) => language.code === code)?.label ?? code.toUpperCase();
}

export function contentLanguageNativeLabel(code: string) {
  return KNOWN_CONTENT_LANGUAGES.find((language) => language.code === code)?.nativeLabel ?? code.toUpperCase();
}

export function parseTranslationGroupId(value: unknown) {
  const raw = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(raw) ? raw : "";
}
