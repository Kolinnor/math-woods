import { parseContentLanguage } from "../languages.ts";
import { en } from "./dictionaries/en.ts";
import { fr } from "./dictionaries/fr.ts";
import type { DeepPartial, Dictionary, InterfaceLocale } from "./types.ts";

export const DEFAULT_INTERFACE_LOCALE: InterfaceLocale = "en";

export function interfaceLocaleForContentLanguage(language: string): InterfaceLocale {
  return parseContentLanguage(language) === "fr" ? "fr" : DEFAULT_INTERFACE_LOCALE;
}

function mergeDictionary<T>(fallback: T, override: DeepPartial<T> | undefined): T {
  if (!override) return fallback;
  if (Array.isArray(fallback) || typeof fallback !== "object" || fallback === null) {
    return (override ?? fallback) as T;
  }

  const merged = { ...fallback } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    const fallbackValue = (fallback as Record<string, unknown>)[key];
    merged[key] = mergeDictionary(fallbackValue, value as never);
  }

  return merged as T;
}

export function dictionaryForLocale(locale: InterfaceLocale): Dictionary {
  const fallback = en as Dictionary;
  if (locale === "fr") return mergeDictionary(fallback, fr as DeepPartial<Dictionary>);
  return fallback;
}

export function dictionaryForContentLanguage(language: string): Dictionary {
  return dictionaryForLocale(interfaceLocaleForContentLanguage(language));
}
