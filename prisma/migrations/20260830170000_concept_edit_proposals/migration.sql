ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONCEPT_EDIT_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONCEPT_EDIT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONCEPT_EDIT_REJECTED';

CREATE TABLE "ConceptEditProposal" (
  "id" SERIAL NOT NULL,
  "conceptId" INTEGER NOT NULL,
  "proposerId" INTEGER NOT NULL,
  "baseUpdatedAt" TIMESTAMP(3) NOT NULL,
  "baseSnapshot" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "editSummary" TEXT,
  "status" "ProblemEditProposalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" INTEGER,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "ConceptEditProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptEditProposal_status_createdAt_idx"
ON "ConceptEditProposal"("status", "createdAt");

CREATE INDEX "ConceptEditProposal_conceptId_status_createdAt_idx"
ON "ConceptEditProposal"("conceptId", "status", "createdAt");

CREATE INDEX "ConceptEditProposal_proposerId_status_createdAt_idx"
ON "ConceptEditProposal"("proposerId", "status", "createdAt");

ALTER TABLE "ConceptEditProposal"
ADD CONSTRAINT "ConceptEditProposal_conceptId_fkey"
FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptEditProposal"
ADD CONSTRAINT "ConceptEditProposal_proposerId_fkey"
FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptEditProposal"
ADD CONSTRAINT "ConceptEditProposal_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
