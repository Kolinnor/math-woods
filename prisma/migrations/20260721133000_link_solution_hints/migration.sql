ALTER TABLE "ProblemHint" ADD COLUMN "proofId" INTEGER;

CREATE UNIQUE INDEX "ProblemHint_proofId_key" ON "ProblemHint"("proofId");

ALTER TABLE "ProblemHint"
ADD CONSTRAINT "ProblemHint_proofId_fkey"
FOREIGN KEY ("proofId") REFERENCES "ProblemProof"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
