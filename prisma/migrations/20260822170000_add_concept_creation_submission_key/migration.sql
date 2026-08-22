ALTER TABLE "Concept"
ADD COLUMN "creationSubmissionKey" TEXT;

CREATE UNIQUE INDEX "Concept_creationSubmissionKey_key"
ON "Concept"("creationSubmissionKey");
