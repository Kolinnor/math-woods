import { contentLanguageLabel, parseContentLanguage } from "./languages.ts";

const languageNames: Record<string, Record<string, string>> = {
  en: { en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese" },
  fr: { en: "anglais", fr: "français", es: "espagnol", de: "allemand", it: "italien", pt: "portugais" }
};

export type ContentLanguageFallback = {
  code: string;
  label: string;
  language: string;
};

export function contentLanguageFallback(
  actualLanguage: string,
  expectedLanguage: string
): ContentLanguageFallback | null {
  const actual = parseContentLanguage(actualLanguage);
  const expected = parseContentLanguage(expectedLanguage);
  if (actual === expected) return null;

  const languageLabel = languageNames[expected]?.[actual] ?? contentLanguageLabel(actual);
  return {
    code: actual.toUpperCase(),
    language: actual,
    label: expected === "fr"
      ? `Disponible uniquement en ${languageLabel}`
      : `Available only in ${languageLabel}`
  };
}
