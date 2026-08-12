ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROBLEM_EDIT_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROBLEM_EDIT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROBLEM_EDIT_REJECTED';

CREATE TYPE "ProblemEditProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

CREATE TABLE "ProblemEditProposal" (
    "id" SERIAL NOT NULL,
    "problemId" INTEGER NOT NULL,
    "proposerId" INTEGER NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editSummary" TEXT,
    "status" "ProblemEditProposalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProblemEditProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemEditProposal_status_createdAt_idx" ON "ProblemEditProposal"("status", "createdAt");
CREATE INDEX "ProblemEditProposal_problemId_status_createdAt_idx" ON "ProblemEditProposal"("problemId", "status", "createdAt");
CREATE INDEX "ProblemEditProposal_proposerId_status_createdAt_idx" ON "ProblemEditProposal"("proposerId", "status", "createdAt");

ALTER TABLE "ProblemEditProposal" ADD CONSTRAINT "ProblemEditProposal_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemEditProposal" ADD CONSTRAINT "ProblemEditProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemEditProposal" ADD CONSTRAINT "ProblemEditProposal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
