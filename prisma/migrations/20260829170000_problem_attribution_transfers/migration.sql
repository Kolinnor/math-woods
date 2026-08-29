ALTER TYPE "NotificationType" ADD VALUE 'PROBLEM_ATTRIBUTION_TRANSFERRED';

CREATE TABLE "ProblemAttributionTransfer" (
    "id" SERIAL NOT NULL,
    "problemId" INTEGER NOT NULL,
    "fromUserId" INTEGER,
    "toUserId" INTEGER,
    "transferredById" INTEGER,
    "fromDisplayName" TEXT NOT NULL,
    "toDisplayName" TEXT NOT NULL,
    "transferredByDisplayName" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemAttributionTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemAttributionTransfer_problemId_createdAt_idx"
    ON "ProblemAttributionTransfer"("problemId", "createdAt");
CREATE INDEX "ProblemAttributionTransfer_fromUserId_idx" ON "ProblemAttributionTransfer"("fromUserId");
CREATE INDEX "ProblemAttributionTransfer_toUserId_idx" ON "ProblemAttributionTransfer"("toUserId");
CREATE INDEX "ProblemAttributionTransfer_transferredById_idx" ON "ProblemAttributionTransfer"("transferredById");

ALTER TABLE "ProblemAttributionTransfer"
    ADD CONSTRAINT "ProblemAttributionTransfer_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemAttributionTransfer"
    ADD CONSTRAINT "ProblemAttributionTransfer_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemAttributionTransfer"
    ADD CONSTRAINT "ProblemAttributionTransfer_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemAttributionTransfer"
    ADD CONSTRAINT "ProblemAttributionTransfer_transferredById_fkey"
    FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
