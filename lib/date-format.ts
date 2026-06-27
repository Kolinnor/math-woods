export const USER_TIME_ZONE_COOKIE = "math-woods-time-zone";

const DEFAULT_TIME_ZONE = "UTC";

export function validTimeZone(value: string | undefined | null) {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return null;
  }
}

export function formatUserDateTime(date: Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: validTimeZone(timeZone) ?? DEFAULT_TIME_ZONE
  }).format(date);
}

export function formatUserShortDateTime(date: Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: validTimeZone(timeZone) ?? DEFAULT_TIME_ZONE
  }).format(date);
}
