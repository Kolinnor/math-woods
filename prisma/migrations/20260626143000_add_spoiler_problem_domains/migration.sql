ALTER TABLE "ProblemDomain" ADD COLUMN "spoiler" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ProblemDomain_spoiler_idx" ON "ProblemDomain"("spoiler");
