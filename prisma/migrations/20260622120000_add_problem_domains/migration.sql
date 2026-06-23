CREATE TABLE "ProblemDomain" (
    "problemId" INTEGER NOT NULL,
    "domain" "MathDomain" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProblemDomain_pkey" PRIMARY KEY ("problemId","domain")
);

INSERT INTO "ProblemDomain" ("problemId", "domain", "position")
SELECT "id", "domain", 0
FROM "Problem";

CREATE INDEX "ProblemDomain_domain_idx" ON "ProblemDomain"("domain");
CREATE INDEX "ProblemDomain_problemId_position_idx" ON "ProblemDomain"("problemId", "position");

ALTER TABLE "ProblemDomain" ADD CONSTRAINT "ProblemDomain_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
