ALTER TABLE "ExplorationBlock"
  ADD COLUMN "canvasX" DOUBLE PRECISION,
  ADD COLUMN "canvasY" DOUBLE PRECISION,
  ADD COLUMN "isStart" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "continueToBlockId" INTEGER;

ALTER TABLE "ExplorationBlockOption"
  ADD COLUMN "toBlockId" INTEGER;

ALTER TABLE "ExplorationBlockOutcome"
  ADD COLUMN "toBlockId" INTEGER;

ALTER TABLE "ExplorationSession"
  ADD COLUMN "currentBlockKey" TEXT,
  ADD COLUMN "visitedBlockKeys" JSONB NOT NULL DEFAULT '[]';

-- Every legacy page needs a block so page-level routes always have a block target.
INSERT INTO "ExplorationBlock" (
  "pageId", "key", "kind", "bodyMarkdown", "bodyHtml", "position", "required", "points", "createdAt", "updatedAt"
)
SELECT
  page."id",
  'legacy-page-' || page."id"::text,
  'MARKDOWN'::"ExplorationBlockKind",
  NULL,
  NULL,
  1,
  false,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ExplorationPage" page
WHERE NOT EXISTS (
  SELECT 1
  FROM "ExplorationBlock" block
  WHERE block."pageId" = page."id" AND block."branchId" IS NULL
);

WITH ordered_blocks AS (
  SELECT
    block."id",
    ROW_NUMBER() OVER (
      PARTITION BY page."playlistId"
      ORDER BY page."position", page."id", block."branchId" NULLS FIRST, block."position", block."id"
    ) AS graph_position
  FROM "ExplorationBlock" block
  JOIN "ExplorationPage" page ON page."id" = block."pageId"
)
UPDATE "ExplorationBlock" block
SET
  "canvasX" = MOD(ordered_blocks.graph_position - 1, 4) * 320.0,
  "canvasY" = FLOOR((ordered_blocks.graph_position - 1) / 4.0) * 220.0
FROM ordered_blocks
WHERE block."id" = ordered_blocks."id";

-- The ordinary reading order first follows the next block in the same legacy sequence.
UPDATE "ExplorationBlock" source
SET "continueToBlockId" = target."id"
FROM "ExplorationBlock" target
WHERE target."id" = (
  SELECT candidate."id"
  FROM "ExplorationBlock" candidate
  WHERE candidate."pageId" = source."pageId"
    AND candidate."branchId" IS NOT DISTINCT FROM source."branchId"
    AND (candidate."position", candidate."id") > (source."position", source."id")
  ORDER BY candidate."position", candidate."id"
  LIMIT 1
);

-- A legacy page Continue now points from its last root block to the first root block of the target page.
UPDATE "ExplorationBlock" source
SET "continueToBlockId" = target."id"
FROM "ExplorationPage" page,
     LATERAL (
       SELECT block."id"
       FROM "ExplorationBlock" block
       WHERE block."pageId" = page."continueToPageId" AND block."branchId" IS NULL
       ORDER BY block."position", block."id"
       LIMIT 1
     ) target
WHERE source."id" = (
  SELECT block."id"
  FROM "ExplorationBlock" block
  WHERE block."pageId" = page."id" AND block."branchId" IS NULL
  ORDER BY block."position" DESC, block."id" DESC
  LIMIT 1
)
AND page."continueToPageId" IS NOT NULL;

-- Returning from an inline branch continues where its source choice would have continued.
-- Parent branches are processed first so nested branches inherit the fully resolved return target.
DO $$
DECLARE
  branch_record RECORD;
  last_block_id INTEGER;
  return_block_id INTEGER;
BEGIN
  FOR branch_record IN
    WITH RECURSIVE branch_depth AS (
      SELECT branch."id", branch."parentBranchId", 0 AS depth
      FROM "ExplorationBranch" branch
      WHERE branch."parentBranchId" IS NULL
      UNION ALL
      SELECT child."id", child."parentBranchId", parent.depth + 1
      FROM "ExplorationBranch" child
      JOIN branch_depth parent ON parent."id" = child."parentBranchId"
    )
    SELECT * FROM branch_depth ORDER BY depth, "id"
  LOOP
    SELECT block."id" INTO last_block_id
    FROM "ExplorationBlock" block
    WHERE block."branchId" = branch_record."id"
    ORDER BY block."position" DESC, block."id" DESC
    LIMIT 1;

    SELECT source_block."continueToBlockId" INTO return_block_id
    FROM "ExplorationBlockOption" source_option
    JOIN "ExplorationBlock" source_block ON source_block."id" = source_option."blockId"
    WHERE source_option."revealBranchId" = branch_record."id";

    IF last_block_id IS NOT NULL THEN
      UPDATE "ExplorationBlock"
      SET "continueToBlockId" = return_block_id
      WHERE "id" = last_block_id;
    END IF;
  END LOOP;
END $$;

UPDATE "ExplorationBlockOption" option
SET "toBlockId" = (
  SELECT block."id"
  FROM "ExplorationBlock" block
  WHERE (
    option."action" = 'REVEAL' AND block."branchId" = option."revealBranchId"
  ) OR (
    option."action" = 'PAGE' AND block."pageId" = option."toPageId" AND block."branchId" IS NULL
  )
  ORDER BY block."position", block."id"
  LIMIT 1
)
WHERE option."action" IN ('PAGE', 'REVEAL');

UPDATE "ExplorationBlockOutcome" outcome
SET "toBlockId" = (
  SELECT block."id"
  FROM "ExplorationBlock" block
  WHERE block."pageId" = outcome."toPageId" AND block."branchId" IS NULL
  ORDER BY block."position", block."id"
  LIMIT 1
)
WHERE outcome."toPageId" IS NOT NULL;

UPDATE "ExplorationBlock" block
SET "isStart" = true
WHERE block."id" IN (
  SELECT DISTINCT ON (page."playlistId") first_block."id"
  FROM "ExplorationPage" page
  JOIN LATERAL (
    SELECT candidate."id"
    FROM "ExplorationBlock" candidate
    WHERE candidate."pageId" = page."id" AND candidate."branchId" IS NULL
    ORDER BY candidate."position", candidate."id"
    LIMIT 1
  ) first_block ON true
  WHERE page."isStart" = true
  ORDER BY page."playlistId", page."position", page."id"
);

UPDATE "ExplorationBlock" block
SET "isEnd" = true
WHERE block."id" IN (
  SELECT DISTINCT ON (page."playlistId") last_block."id"
  FROM "ExplorationPage" page
  JOIN LATERAL (
    SELECT candidate."id"
    FROM "ExplorationBlock" candidate
    WHERE candidate."pageId" = page."id" AND candidate."branchId" IS NULL
    ORDER BY candidate."position" DESC, candidate."id" DESC
    LIMIT 1
  ) last_block ON true
  WHERE page."isEnd" = true
  ORDER BY page."playlistId", page."position" DESC, page."id" DESC
);

CREATE INDEX "ExplorationBlock_continueToBlockId_idx" ON "ExplorationBlock"("continueToBlockId");
CREATE INDEX "ExplorationBlockOption_toBlockId_idx" ON "ExplorationBlockOption"("toBlockId");
CREATE INDEX "ExplorationBlockOutcome_toBlockId_idx" ON "ExplorationBlockOutcome"("toBlockId");

ALTER TABLE "ExplorationBlock"
  ADD CONSTRAINT "ExplorationBlock_continueToBlockId_fkey"
  FOREIGN KEY ("continueToBlockId") REFERENCES "ExplorationBlock"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlockOption"
  ADD CONSTRAINT "ExplorationBlockOption_toBlockId_fkey"
  FOREIGN KEY ("toBlockId") REFERENCES "ExplorationBlock"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlockOutcome"
  ADD CONSTRAINT "ExplorationBlockOutcome_toBlockId_fkey"
  FOREIGN KEY ("toBlockId") REFERENCES "ExplorationBlock"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
