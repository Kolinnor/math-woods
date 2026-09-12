import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";

export const homePublicStatsQuery = Prisma.sql`
  WITH public_problems AS (
    SELECT DISTINCT "translationGroupId" FROM "Problem"
    WHERE status = 'PUBLISHED' AND listed = true
      AND language IN (${Prisma.join(ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code))})
  )
  SELECT
    (SELECT COUNT(*) FROM public_problems) AS problems,
    (SELECT COUNT(DISTINCT "translationGroupId") FROM "Concept"
      WHERE status <> 'MISSING'
        AND language IN (${Prisma.join(ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code))})
    ) AS concepts,
    (SELECT COUNT(DISTINCT (a."userId", p."translationGroupId"))
      FROM "ProblemAttempt" a
      JOIN "Problem" p ON p.id = a."problemId"
      JOIN public_problems visible ON visible."translationGroupId" = p."translationGroupId"
      WHERE a.status = 'SOLVED'
    ) AS resolutions
`;

// These totals are public and shared across languages; refresh at most once a minute.
export const getHomePublicStats = unstable_cache(async () => {
  const [counts] = await prisma.$queryRaw<{
    problems: bigint; concepts: bigint; resolutions: bigint;
  }[]>(homePublicStatsQuery);
  return {
    problems: Number(counts.problems),
    concepts: Number(counts.concepts),
    resolutions: Number(counts.resolutions)
  };
}, ["home-public-stats-v1"], { revalidate: 60 });
