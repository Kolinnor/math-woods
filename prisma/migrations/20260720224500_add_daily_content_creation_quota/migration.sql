ALTER TABLE "PageRevision"
ADD COLUMN "isCreation" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PageRevision"
SET "isCreation" = true
WHERE "pageType" IN ('PROBLEM', 'CONCEPT')
  AND "editSummary" IN ('Problem created', 'Concept created', 'Imported from Markdown');

CREATE INDEX "PageRevision_editedById_isCreation_createdAt_idx"
ON "PageRevision"("editedById", "isCreation", "createdAt");
