ALTER TABLE "Problem" ADD COLUMN "translatedFromProblemId" INTEGER;
ALTER TABLE "Problem" ADD COLUMN "translatedFromRevisionId" INTEGER;

ALTER TABLE "Concept" ADD COLUMN "translatedFromConceptId" INTEGER;
ALTER TABLE "Concept" ADD COLUMN "translatedFromRevisionId" INTEGER;

CREATE INDEX "Problem_translatedFromProblemId_idx" ON "Problem"("translatedFromProblemId");
CREATE INDEX "Concept_translatedFromConceptId_idx" ON "Concept"("translatedFromConceptId");

ALTER TABLE "Problem"
  ADD CONSTRAINT "Problem_translatedFromProblemId_fkey"
  FOREIGN KEY ("translatedFromProblemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Concept"
  ADD CONSTRAINT "Concept_translatedFromConceptId_fkey"
  FOREIGN KEY ("translatedFromConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
