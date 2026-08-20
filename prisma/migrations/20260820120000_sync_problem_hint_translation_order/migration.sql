WITH canonical_hint AS (
  SELECT DISTINCT ON ("translationGroupId")
    "translationGroupId",
    "position"
  FROM "ProblemHint"
  ORDER BY
    "translationGroupId",
    CASE WHEN "translatedFromHintId" IS NULL THEN 0 ELSE 1 END,
    "id"
)
UPDATE "ProblemHint" AS translated
SET "position" = canonical_hint."position"
FROM canonical_hint
WHERE translated."translationGroupId" = canonical_hint."translationGroupId"
  AND translated."position" IS DISTINCT FROM canonical_hint."position";
