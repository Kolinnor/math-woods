ALTER TABLE "ProblemHint"
  ADD COLUMN "translationGroupId" TEXT;

UPDATE "ProblemHint"
SET "translationGroupId" = 'legacy-hint-' || "id"::text;

ALTER TABLE "ProblemHint"
  ALTER COLUMN "translationGroupId" SET NOT NULL;

CREATE UNIQUE INDEX "ProblemHint_translationGroupId_problemId_key"
  ON "ProblemHint"("translationGroupId", "problemId");

CREATE INDEX "ProblemHint_translationGroupId_idx"
  ON "ProblemHint"("translationGroupId");
