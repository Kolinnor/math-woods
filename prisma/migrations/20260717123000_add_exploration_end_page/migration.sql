ALTER TABLE "ExplorationPage"
  ADD COLUMN "isEnd" BOOLEAN NOT NULL DEFAULT false;

WITH final_pages AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "playlistId"
    ORDER BY "position" DESC, "id" DESC
  ) AS rank
  FROM "ExplorationPage"
)
UPDATE "ExplorationPage" AS page
SET "isEnd" = true
FROM final_pages
WHERE page."id" = final_pages."id" AND final_pages.rank = 1;

CREATE UNIQUE INDEX "ExplorationPage_one_end_per_playlist"
  ON "ExplorationPage"("playlistId")
  WHERE "isEnd" = true;
