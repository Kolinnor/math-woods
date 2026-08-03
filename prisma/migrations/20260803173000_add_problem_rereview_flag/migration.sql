ALTER TABLE "Problem"
ADD COLUMN "needsReviewAfterEdit" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Problem" AS problem
SET "needsReviewAfterEdit" = true
WHERE problem."qualityStatus" <> 'REVIEWED'
  AND EXISTS (
    SELECT 1
    FROM "PageRevision" AS revision
    WHERE revision."pageType" = 'PROBLEM'
      AND revision."pageId" = problem.id
      AND revision."editSummary" = 'Problem reviewed'
      AND COALESCE(revision."problemVersion", 0) < problem.version
  );
