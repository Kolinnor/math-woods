ALTER TABLE "ProblemHint"
ADD COLUMN "translatedFromHintId" INTEGER,
ADD COLUMN "translatedById" INTEGER;

ALTER TABLE "ProblemProof"
ADD COLUMN "translationGroupId" TEXT,
ADD COLUMN "translatedFromProofId" INTEGER,
ADD COLUMN "translatedById" INTEGER;

UPDATE "ProblemProof"
SET "translationGroupId" = 'legacy-proof-' || "id"::text
WHERE "translationGroupId" IS NULL;

ALTER TABLE "ProblemProof"
ALTER COLUMN "translationGroupId" SET NOT NULL;

CREATE UNIQUE INDEX "ProblemProof_translationGroupId_problemId_key"
ON "ProblemProof"("translationGroupId", "problemId");
CREATE INDEX "ProblemProof_translationGroupId_idx" ON "ProblemProof"("translationGroupId");
CREATE INDEX "ProblemProof_translatedFromProofId_idx" ON "ProblemProof"("translatedFromProofId");
CREATE INDEX "ProblemProof_translatedById_idx" ON "ProblemProof"("translatedById");
CREATE INDEX "ProblemHint_translatedFromHintId_idx" ON "ProblemHint"("translatedFromHintId");
CREATE INDEX "ProblemHint_translatedById_idx" ON "ProblemHint"("translatedById");

ALTER TABLE "ProblemHint"
ADD CONSTRAINT "ProblemHint_translatedFromHintId_fkey"
FOREIGN KEY ("translatedFromHintId") REFERENCES "ProblemHint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemHint"
ADD CONSTRAINT "ProblemHint_translatedById_fkey"
FOREIGN KEY ("translatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemProof"
ADD CONSTRAINT "ProblemProof_translatedFromProofId_fkey"
FOREIGN KEY ("translatedFromProofId") REFERENCES "ProblemProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemProof"
ADD CONSTRAINT "ProblemProof_translatedById_fkey"
FOREIGN KEY ("translatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
