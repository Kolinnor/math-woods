-- A translated problem is one mathematical problem for progress, favorites,
-- and front-page curation. Backfill every language version from group state.
WITH group_attempts AS (
  SELECT
    pa."userId",
    p."translationGroupId",
    CASE
      WHEN BOOL_OR(pa."status" = 'SOLVED') THEN 'SOLVED'::"AttemptStatus"
      WHEN BOOL_OR(pa."status" = 'REVIEW_LATER') THEN 'REVIEW_LATER'::"AttemptStatus"
      WHEN BOOL_OR(pa."status" = 'BLOCKED') THEN 'BLOCKED'::"AttemptStatus"
      ELSE 'STARTED'::"AttemptStatus"
    END AS "status",
    MIN(pa."startedAt") AS "startedAt",
    MIN(pa."discussionUnlockAt") AS "discussionUnlockAt",
    MIN(pa."createdAt") AS "createdAt"
  FROM "ProblemAttempt" pa
  JOIN "Problem" p ON p."id" = pa."problemId"
  GROUP BY pa."userId", p."translationGroupId"
), translated_attempts AS (
  SELECT
    ga."userId",
    p."id" AS "problemId",
    ga."status",
    ga."startedAt",
    ga."discussionUnlockAt",
    ga."createdAt"
  FROM group_attempts ga
  JOIN "Problem" p ON p."translationGroupId" = ga."translationGroupId"
)
INSERT INTO "ProblemAttempt" (
  "userId",
  "problemId",
  "status",
  "startedAt",
  "discussionUnlockAt",
  "createdAt",
  "updatedAt"
)
SELECT
  ta."userId",
  ta."problemId",
  ta."status",
  ta."startedAt",
  ta."discussionUnlockAt",
  ta."createdAt",
  NOW()
FROM translated_attempts ta
ON CONFLICT ("userId", "problemId") DO UPDATE SET
  "status" = EXCLUDED."status",
  "startedAt" = LEAST("ProblemAttempt"."startedAt", EXCLUDED."startedAt"),
  "discussionUnlockAt" = LEAST("ProblemAttempt"."discussionUnlockAt", EXCLUDED."discussionUnlockAt"),
  "updatedAt" = NOW();

WITH group_favorites AS (
  SELECT DISTINCT pf."userId", p."translationGroupId"
  FROM "ProblemFavorite" pf
  JOIN "Problem" p ON p."id" = pf."problemId"
)
INSERT INTO "ProblemFavorite" ("userId", "problemId", "createdAt")
SELECT gf."userId", p."id", NOW()
FROM group_favorites gf
JOIN "Problem" p ON p."translationGroupId" = gf."translationGroupId"
ON CONFLICT ("userId", "problemId") DO NOTHING;

WITH front_page_groups AS (
  SELECT "translationGroupId", BOOL_OR("canAppearOnFrontPage") AS "canAppearOnFrontPage"
  FROM "Problem"
  GROUP BY "translationGroupId"
)
UPDATE "Problem" p
SET "canAppearOnFrontPage" = fpg."canAppearOnFrontPage"
FROM front_page_groups fpg
WHERE p."translationGroupId" = fpg."translationGroupId"
  AND p."canAppearOnFrontPage" IS DISTINCT FROM fpg."canAppearOnFrontPage";
