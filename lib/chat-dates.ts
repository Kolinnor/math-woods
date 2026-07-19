import { validTimeZone } from "./date-format.ts";
import type { InterfaceLocale } from "./i18n/types.ts";

const DATE_LOCALES: Record<InterfaceLocale, string> = {
  en: "en-US",
  fr: "fr-FR"
};

function resolvedTimeZone(timeZone?: string | null) {
  return validTimeZone(timeZone) ?? "UTC";
}

export function chatDayKey(value: string, timeZone?: string | null) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: resolvedTimeZone(timeZone)
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatChatDay(value: string, locale: InterfaceLocale, timeZone?: string | null) {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
    timeZone: resolvedTimeZone(timeZone)
  }).format(new Date(value));
}

export function formatChatTime(value: string, locale: InterfaceLocale, timeZone?: string | null) {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: resolvedTimeZone(timeZone)
  }).format(new Date(value));
}
