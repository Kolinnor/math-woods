CREATE TYPE "ContributionRequestKind" AS ENUM ('PROBLEM', 'CONCEPT');
CREATE TYPE "ContributionRequestStatus" AS ENUM ('OPEN', 'CLAIMED', 'COMPLETED');

CREATE TABLE "ContributionRequest" (
    "id" SERIAL NOT NULL,
    "kind" "ContributionRequestKind" NOT NULL,
    "status" "ContributionRequestStatus" NOT NULL DEFAULT 'OPEN',
    "body" TEXT NOT NULL,
    "requesterId" INTEGER,
    "claimedById" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContributionRequest_kind_status_createdAt_idx" ON "ContributionRequest"("kind", "status", "createdAt");
CREATE INDEX "ContributionRequest_requesterId_idx" ON "ContributionRequest"("requesterId");
CREATE INDEX "ContributionRequest_claimedById_idx" ON "ContributionRequest"("claimedById");

ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
