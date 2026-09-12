import { addDaysToDateKey, dailyProblemDateKey } from "./daily-problem-schedule.ts";
import { CONTEST_TIME_ZONE } from "./problem-contests.ts";

/** Feature a published contest until noon in Paris on the following calendar day. */
export function shouldPrioritizeHomeContest(contest: { publishedAt: Date | null; endDateKey: string }, now = new Date()) {
  if (!contest.publishedAt || contest.publishedAt > now) return false;
  const today = dailyProblemDateKey(now, CONTEST_TIME_ZONE);
  if (today > contest.endDateKey) return false;
  const publicationDay = dailyProblemDateKey(contest.publishedAt, CONTEST_TIME_ZONE);
  if (today === publicationDay) return true;
  if (today !== addDaysToDateKey(publicationDay, 1)) return false;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: CONTEST_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour < 12;
}
