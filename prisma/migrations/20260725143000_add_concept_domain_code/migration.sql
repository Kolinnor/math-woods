ALTER TABLE "Concept"
ADD COLUMN "domainCode" TEXT NOT NULL DEFAULT 'other';

UPDATE "Concept"
SET "domainCode" = CASE "domain"
  WHEN 'LOGIC' THEN 'logic'
  WHEN 'COMBINATORICS' THEN 'combinatorics'
  WHEN 'ALGEBRA' THEN 'algebra'
  WHEN 'ANALYSIS' THEN 'real-analysis'
  WHEN 'GEOMETRY' THEN 'geometry'
  WHEN 'PROBABILITY' THEN 'probability-statistics'
  WHEN 'ARITHMETIC' THEN 'number-theory'
  WHEN 'TOPOLOGY' THEN 'general-topology'
  ELSE 'other'
END;

CREATE INDEX "Concept_domainCode_idx" ON "Concept"("domainCode");
