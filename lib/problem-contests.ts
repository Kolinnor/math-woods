import { addDaysToDateKey, dailyProblemDateKey, isDailyProblemDateKey } from "./daily-problem-schedule.ts";

export const CONTEST_TIME_ZONE = "Europe/Paris";
export const DEFAULT_CONTEST_REWARD = 300;
export const DEFAULT_CONTEST_IMAGE_URL = "/art/morning-in-a-pine-forest.jpg";

export type ContestPhase = "draft" | "upcoming" | "open" | "judging" | "closed";

export function contestEndDateKey(startDateKey: string) {
  return addDaysToDateKey(startDateKey, 6);
}

export function isSaturdayDateKey(dateKey: string) {
  if (!isDailyProblemDateKey(dateKey)) return false;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 6;
}

export function nextContestStartDateKey(now = new Date()) {
  const today = dailyProblemDateKey(now, CONTEST_TIME_ZONE);
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDaysToDateKey(today, (6 - weekday + 7) % 7);
}

export function contestPhase(contest: {
  publishedAt: Date | null;
  resultsPublishedAt: Date | null;
  startDateKey: string;
  endDateKey: string;
}, today = dailyProblemDateKey(new Date(), CONTEST_TIME_ZONE)): ContestPhase {
  if (!contest.publishedAt) return "draft";
  if (today < contest.startDateKey) return "upcoming";
  if (today <= contest.endDateKey) return "open";
  return contest.resultsPublishedAt ? "closed" : "judging";
}

export function contestIsOpen(contest: {
  publishedAt: Date | null;
  resultsPublishedAt: Date | null;
  startDateKey: string;
  endDateKey: string;
}, today = dailyProblemDateKey(new Date(), CONTEST_TIME_ZONE)) {
  return contestPhase(contest, today) === "open";
}

export function contestDateLabel(dateKey: string, locale: "en" | "fr", options: Intl.DateTimeFormatOptions = {}) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    ...options
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function dateKeyMidnightInParis(dateKey: string) {
  if (!isDailyProblemDateKey(dateKey)) throw new Error("Invalid contest date.");
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: CONTEST_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const observed = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    guess += target - observed;
  }
  return new Date(guess);
}

export function contestCreationWindow(contest: { startDateKey: string; endDateKey: string }) {
  return {
    gte: dateKeyMidnightInParis(contest.startDateKey),
    lt: dateKeyMidnightInParis(addDaysToDateKey(contest.endDateKey, 1))
  };
}

export function localizedContestText<T extends {
  titleEn: string;
  titleFr: string;
  summaryEn: string;
  summaryFr: string;
  bodyEn: string;
  bodyFr: string;
  rulesEn: string;
  rulesFr: string;
  criteriaEn: string;
  criteriaFr: string;
}>(contest: T, locale: "en" | "fr") {
  return locale === "fr"
    ? {
        title: contest.titleFr,
        summary: contest.summaryFr,
        body: contest.bodyFr,
        rules: contest.rulesFr,
        criteria: contest.criteriaFr
      }
    : {
        title: contest.titleEn,
        summary: contest.summaryEn,
        body: contest.bodyEn,
        rules: contest.rulesEn,
        criteria: contest.criteriaEn
      };
}
