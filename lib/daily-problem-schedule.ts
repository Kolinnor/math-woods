export const DAILY_PROBLEM_TIME_ZONE = "Europe/Paris";
export const DAILY_PROBLEM_SCHEDULE_DAYS = 7;
export const DEFAULT_DAILY_PROBLEM_IMAGE_URLS = [
  "/art/rye.jpg",
  "/art/oak-grove.jpg",
  "/art/birch-grove.jpg",
  "/art/brook-in-the-forest.jpg",
  "/art/pine-forest.jpg",
  "/art/morning-in-a-pine-forest.jpg"
] as const;
export const DEFAULT_DAILY_PROBLEM_IMAGE_URL = DEFAULT_DAILY_PROBLEM_IMAGE_URLS[0];

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function dailyProblemDateKey(date = new Date(), timeZone = DAILY_PROBLEM_TIME_ZONE) {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function isDailyProblemDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  if (!isDailyProblemDateKey(dateKey)) throw new Error("Invalid daily problem date.");
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function upcomingDailyProblemDateKeys(
  now = new Date(),
  count = DAILY_PROBLEM_SCHEDULE_DAYS,
  timeZone = DAILY_PROBLEM_TIME_ZONE
) {
  const today = dailyProblemDateKey(now, timeZone);
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDaysToDateKey(today, index));
}

export function dailyProblemRotationIndex(total: number, dateKey: string) {
  if (!total || !isDailyProblemDateKey(dateKey)) return 0;
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return dayNumber % total;
}

export function automaticDailyProblemGroup(
  candidates: Array<{ createdAt: Date; qualityStatus: string; translationGroupId: string }>,
  dateKey: string,
  timeZone = DAILY_PROBLEM_TIME_ZONE
) {
  if (!candidates.length) return null;

  const mostRecentPublicationDay = candidates.reduce((latest, candidate) => {
    const candidateDay = dailyProblemDateKey(candidate.createdAt, timeZone);
    return candidateDay > latest ? candidateDay : latest;
  }, "");
  const recentCandidates = candidates.filter(
    (candidate) => dailyProblemDateKey(candidate.createdAt, timeZone) === mostRecentPublicationDay
  );
  const reviewedCandidates = recentCandidates.filter((candidate) => candidate.qualityStatus === "REVIEWED");
  const preferredCandidates = reviewedCandidates.length ? reviewedCandidates : recentCandidates;
  const groups = [...new Set(preferredCandidates.map((candidate) => candidate.translationGroupId))].sort();

  return groups[dailyProblemRotationIndex(groups.length, dateKey)] ?? null;
}

export function dailyProblemDefaultImageUrl(dateKey: string) {
  return DEFAULT_DAILY_PROBLEM_IMAGE_URLS[
    dailyProblemRotationIndex(DEFAULT_DAILY_PROBLEM_IMAGE_URLS.length, dateKey)
  ] ?? DEFAULT_DAILY_PROBLEM_IMAGE_URL;
}

export function dateFromDailyProblemKey(dateKey: string) {
  if (!isDailyProblemDateKey(dateKey)) throw new Error("Invalid daily problem date.");
  return new Date(`${dateKey}T12:00:00.000Z`);
}
