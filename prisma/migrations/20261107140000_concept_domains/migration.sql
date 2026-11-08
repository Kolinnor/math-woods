ALTER TABLE "Concept" ADD COLUMN "domainCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Concept" SET "domainCodes" = ARRAY["domainCode"];
CREATE INDEX "Concept_domainCodes_idx" ON "Concept" USING GIN ("domainCodes");
