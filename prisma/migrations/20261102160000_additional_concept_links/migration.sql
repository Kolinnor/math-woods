ALTER TABLE "Problem" ADD COLUMN "additionalConceptSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Concept" ADD COLUMN "additionalConceptSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
