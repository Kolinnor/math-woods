ALTER TABLE "PageRevision"
ADD COLUMN "conceptTitle" TEXT;

WITH "LatestConceptRevision" AS (
  SELECT DISTINCT ON ("pageId") "id", "pageId"
  FROM "PageRevision"
  WHERE "pageType" = 'CONCEPT'
  ORDER BY "pageId", "createdAt" DESC, "id" DESC
)
UPDATE "PageRevision" AS revision
SET "conceptTitle" = concept."title"
FROM "LatestConceptRevision" AS latest
JOIN "Concept" AS concept ON concept."id" = latest."pageId"
WHERE revision."id" = latest."id";
