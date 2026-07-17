UPDATE "Problem" AS translated
SET "createdAt" = original."createdAt"
FROM "Problem" AS original
WHERE translated."translationGroupId" = original."translationGroupId"
  AND translated."id" <> original."id"
  AND translated."translatedFromProblemId" IS NOT NULL
  AND original."translatedFromProblemId" IS NULL
  AND translated."createdAt" <> original."createdAt";
