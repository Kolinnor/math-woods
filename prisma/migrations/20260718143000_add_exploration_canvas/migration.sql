ALTER TABLE "ExplorationPage"
  ADD COLUMN "canvasX" DOUBLE PRECISION,
  ADD COLUMN "canvasY" DOUBLE PRECISION,
  ADD COLUMN "continueToPageId" INTEGER;

WITH ordered_pages AS (
  SELECT
    "id",
    LEAD("id") OVER (PARTITION BY "playlistId" ORDER BY "position", "id") AS "nextPageId"
  FROM "ExplorationPage"
)
UPDATE "ExplorationPage" AS page
SET "continueToPageId" = ordered_pages."nextPageId"
FROM ordered_pages
WHERE page."id" = ordered_pages."id";

UPDATE "ExplorationPage"
SET
  "canvasX" = MOD("position" - 1, 4) * 320.0,
  "canvasY" = (("position" - 1) / 4) * 220.0;

CREATE INDEX "ExplorationPage_continueToPageId_idx"
  ON "ExplorationPage"("continueToPageId");

ALTER TABLE "ExplorationPage"
  ADD CONSTRAINT "ExplorationPage_continueToPageId_fkey"
  FOREIGN KEY ("continueToPageId") REFERENCES "ExplorationPage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
