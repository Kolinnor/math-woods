ALTER TYPE "TargetType" ADD VALUE 'PROOF';

CREATE TABLE "ProblemProof" (
    "id" SERIAL NOT NULL,
    "problemId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemProof_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofComment" (
    "id" SERIAL NOT NULL,
    "proofId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemScore" (
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "naturality" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemScore_pkey" PRIMARY KEY ("userId","problemId")
);

CREATE INDEX "ProblemProof_problemId_createdAt_idx" ON "ProblemProof"("problemId", "createdAt");
CREATE INDEX "ProofComment_proofId_createdAt_idx" ON "ProofComment"("proofId", "createdAt");
CREATE INDEX "ProblemScore_problemId_idx" ON "ProblemScore"("problemId");

ALTER TABLE "ProblemProof" ADD CONSTRAINT "ProblemProof_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemProof" ADD CONSTRAINT "ProblemProof_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofComment" ADD CONSTRAINT "ProofComment_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "ProblemProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofComment" ADD CONSTRAINT "ProofComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemScore" ADD CONSTRAINT "ProblemScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemScore" ADD CONSTRAINT "ProblemScore_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
