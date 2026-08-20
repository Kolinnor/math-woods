DELETE FROM "SiteImprovementActivity"
WHERE "type" = 'ASSIGNEE_CHANGED';

ALTER TABLE "SiteImprovement"
DROP CONSTRAINT "SiteImprovement_assigneeId_fkey";

DROP INDEX "SiteImprovement_assigneeId_idx";

ALTER TABLE "SiteImprovement"
DROP COLUMN "assigneeId";

ALTER TYPE "SiteImprovementActivityType" RENAME TO "SiteImprovementActivityType_old";

CREATE TYPE "SiteImprovementActivityType" AS ENUM (
  'CREATED',
  'DETAILS_CHANGED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED'
);

ALTER TABLE "SiteImprovementActivity"
ALTER COLUMN "type" TYPE "SiteImprovementActivityType"
USING ("type"::text::"SiteImprovementActivityType");

DROP TYPE "SiteImprovementActivityType_old";
