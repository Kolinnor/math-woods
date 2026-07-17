UPDATE "Problem" AS translated
SET "authorId" = original."authorId"
FROM "Problem" AS original
WHERE translated."translationGroupId" = original."translationGroupId"
  AND translated."translatedFromProblemId" IS NOT NULL
  AND original."translatedFromProblemId" IS NULL
  AND translated."authorId" <> original."authorId";
