ALTER TABLE "ProblemDomain" ADD COLUMN "mscCode" TEXT;

UPDATE "ProblemDomain"
SET "mscCode" = "domain"::text
WHERE "mscCode" IS NULL;

ALTER TABLE "ProblemDomain" ALTER COLUMN "mscCode" SET NOT NULL;

ALTER TABLE "ProblemDomain" DROP CONSTRAINT "ProblemDomain_pkey";
ALTER TABLE "ProblemDomain" ADD CONSTRAINT "ProblemDomain_pkey" PRIMARY KEY ("problemId", "mscCode");

CREATE INDEX "ProblemDomain_mscCode_idx" ON "ProblemDomain"("mscCode");
