UPDATE "Problem" AS translated
SET "difficulty" = original."difficulty"
FROM "Problem" AS original
WHERE translated."translationGroupId" = original."translationGroupId"
  AND translated."translatedFromProblemId" IS NOT NULL
  AND original."translatedFromProblemId" IS NULL
  AND translated."difficulty" IS DISTINCT FROM original."difficulty";
