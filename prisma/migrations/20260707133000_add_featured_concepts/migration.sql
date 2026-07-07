ALTER TABLE "Concept" ADD COLUMN "canAppearInConceptBrowser" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Concept_language_canAppearInConceptBrowser_updatedAt_idx"
ON "Concept"("language", "canAppearInConceptBrowser", "updatedAt");
