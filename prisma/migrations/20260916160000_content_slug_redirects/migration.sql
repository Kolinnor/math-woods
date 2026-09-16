ALTER TABLE "ConceptRedirect" ADD COLUMN "isRename" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ProblemRedirect" (
  "id" SERIAL NOT NULL,
  "sourceSlug" TEXT NOT NULL,
  "targetProblemId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProblemRedirect_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProblemRedirect_sourceSlug_key" ON "ProblemRedirect"("sourceSlug");
CREATE INDEX "ProblemRedirect_targetProblemId_idx" ON "ProblemRedirect"("targetProblemId");
ALTER TABLE "ProblemRedirect" ADD CONSTRAINT "ProblemRedirect_targetProblemId_fkey" FOREIGN KEY ("targetProblemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
