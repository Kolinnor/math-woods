ALTER TABLE "Problem"
ADD COLUMN "showRelatedProblems" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Problem"
SET "showRelatedProblems" = false
WHERE "isExercise" = true;
