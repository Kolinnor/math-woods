UPDATE "Problem"
SET "canAppearOnFrontPage" = true
WHERE "qualityStatus" = 'EXCELLENT';

ALTER TABLE "Problem"
ALTER COLUMN "qualityStatus" DROP DEFAULT;

ALTER TYPE "QualityStatus" RENAME TO "QualityStatus_old";

CREATE TYPE "QualityStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'NEEDS_WORK');

ALTER TABLE "Problem"
ALTER COLUMN "qualityStatus" TYPE "QualityStatus"
USING (
  CASE
    WHEN "qualityStatus"::text IN ('GOOD', 'EXCELLENT') THEN 'REVIEWED'
    ELSE "qualityStatus"::text
  END
)::"QualityStatus";

ALTER TABLE "Problem"
ALTER COLUMN "qualityStatus" SET DEFAULT 'UNREVIEWED';

DROP TYPE "QualityStatus_old";
