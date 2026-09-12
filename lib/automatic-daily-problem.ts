import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { automaticDailyProblemGroup, dailyProblemLikePool, isDailyProblemDateKey } from "@/lib/daily-problem-schedule";

// One candidate per mathematical problem; translations share likes and history.
export const automaticDailyCandidatesQuery = Prisma.sql`
  WITH candidates AS (
    SELECT DISTINCT ON (p."translationGroupId") p.id, p."translationGroupId"
    FROM "Problem" p
    WHERE p.status = 'PUBLISHED' AND p.listed AND NOT p."isExercise" AND NOT p."isConjecture"
      AND p."qualityStatus" = 'REVIEWED' AND NOT p."needsReviewAfterEdit"
      AND p.difficulty BETWEEN 20 AND 50
      AND p.language IN (${Prisma.join(ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code))})
      AND NOT EXISTS (
        SELECT 1 FROM "DailyProblemSchedule" s JOIN "Problem" featured ON featured.id = s."problemId"
        WHERE featured."translationGroupId" = p."translationGroupId"
      )
    ORDER BY p."translationGroupId", (p."translatedFromProblemId" IS NULL) DESC, p.id
  )
  SELECT c.*, (
    SELECT COUNT(DISTINCT f."userId")::int
    FROM "ProblemFavorite" f JOIN "Problem" liked ON liked.id = f."problemId"
    WHERE liked."translationGroupId" = c."translationGroupId"
      AND NOT EXISTS (SELECT 1 FROM "Problem" authored
        WHERE authored."translationGroupId" = c."translationGroupId" AND authored."authorId" = f."userId")
  ) AS likes FROM candidates c
`;

export async function selectAutomaticDailyProblem(dateKey: string) {
  if (!isDailyProblemDateKey(dateKey)) return null;
  const candidates = await prisma.$queryRaw<{ id: number; translationGroupId: string; likes: number }[]>(automaticDailyCandidatesQuery);
  const group = automaticDailyProblemGroup(dailyProblemLikePool(candidates), dateKey);
  return candidates.find(({ translationGroupId }) => translationGroupId === group) ?? null;
}

const scheduleInclude = {
  problem: { select: { translationGroupId: true, status: true, listed: true, isExercise: true } }
} as const;

export async function getOrCreateDailyProblemSchedule(dateKey: string) {
  if (!isDailyProblemDateKey(dateKey)) return null;
  const existing = await prisma.dailyProblemSchedule.findUnique({ where: { dateKey }, include: scheduleInclude });
  if (existing) return existing;
  const selected = await selectAutomaticDailyProblem(dateKey);
  if (!selected) return null;
  // Read the winning row back: concurrent visitors (or a manual choice) must see the same problem.
  await prisma.dailyProblemSchedule.createMany({
    data: [{ dateKey, problemId: selected.id }], skipDuplicates: true
  });
  return prisma.dailyProblemSchedule.findUnique({ where: { dateKey }, include: scheduleInclude });
}
