ALTER TABLE "Problem"
ADD COLUMN "isExercise" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Problem_isExercise_status_createdAt_idx"
ON "Problem"("isExercise", "status", "createdAt");
