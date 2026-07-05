import { cookies } from "next/headers";
import { CONTENT_LANGUAGE_COOKIE } from "@/lib/languages";
import {
  DEFAULT_INTERFACE_LOCALE,
  dictionaryForContentLanguage,
  dictionaryForLocale,
  interfaceLocaleForContentLanguage
} from "./dictionary.ts";

export { dictionaryForContentLanguage, dictionaryForLocale, interfaceLocaleForContentLanguage };

export async function getInterfaceLocale() {
  const cookieStore = await cookies();
  return interfaceLocaleForContentLanguage(cookieStore.get(CONTENT_LANGUAGE_COOKIE)?.value ?? DEFAULT_INTERFACE_LOCALE);
}

export async function getTranslations() {
  return dictionaryForLocale(await getInterfaceLocale());
}
