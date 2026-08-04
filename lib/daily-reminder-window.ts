const DAILY_REMINDER_TIME_ZONE = "Europe/Paris";

function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}

function localTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const rendered = timeZoneParts(new Date(initialUtc), timeZone);
  const renderedUtc = Date.UTC(
    rendered.year,
    rendered.month - 1,
    rendered.day,
    rendered.hour,
    rendered.minute,
    rendered.second
  );

  return new Date(initialUtc - (renderedUtc - initialUtc));
}

function addUtcDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

export function dailyReminderWindow(now: Date) {
  const today = timeZoneParts(now, DAILY_REMINDER_TIME_ZONE);
  const tomorrow = addUtcDays(today.year, today.month, today.day, 1);

  return {
    start: localTimeToUtc(today.year, today.month, today.day, 0, 0, DAILY_REMINDER_TIME_ZONE),
    end: localTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, DAILY_REMINDER_TIME_ZONE)
  };
}
