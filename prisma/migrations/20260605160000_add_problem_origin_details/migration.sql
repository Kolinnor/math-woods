ALTER TABLE "Problem" RENAME COLUMN "source" TO "origin";

UPDATE "Problem"
SET "origin" = 'Unknown'
WHERE "origin" IS NULL OR trim("origin") = '';

ALTER TABLE "Problem"
ALTER COLUMN "origin" SET DEFAULT 'Unknown',
ALTER COLUMN "origin" SET NOT NULL,
ADD COLUMN "originChapter" TEXT,
ADD COLUMN "originPage" TEXT,
ADD COLUMN "originNote" TEXT;
