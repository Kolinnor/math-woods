-- Keep the persisted block order aligned with the folder order used by the studio.
WITH ordered_blocks AS (
  SELECT
    block."id",
    ROW_NUMBER() OVER (
      PARTITION BY page."playlistId"
      ORDER BY
        CASE WHEN block."folderId" IS NULL THEN 0 ELSE 1 END,
        folder."position" NULLS FIRST,
        folder."id" NULLS FIRST,
        block."position",
        block."id"
    )::integer AS "nextPosition"
  FROM "ExplorationBlock" AS block
  JOIN "ExplorationPage" AS page ON page."id" = block."pageId"
  LEFT JOIN "ExplorationBlockFolder" AS folder ON folder."id" = block."folderId"
)
UPDATE "ExplorationBlock" AS block
SET "position" = ordered_blocks."nextPosition"
FROM ordered_blocks
WHERE block."id" = ordered_blocks."id";
