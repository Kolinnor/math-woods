CREATE TABLE "LibraryReferencePresentationRevision" (
  "id" SERIAL NOT NULL,
  "referenceId" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "previousMarkdown" TEXT,
  "isBaseline" BOOLEAN NOT NULL DEFAULT false,
  "editedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryReferencePresentationRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LibraryReferencePresentationRevision_referenceId_language_id_idx" ON "LibraryReferencePresentationRevision"("referenceId", "language", "id");
CREATE INDEX "LibraryReferencePresentationRevision_editedById_idx" ON "LibraryReferencePresentationRevision"("editedById");
ALTER TABLE "LibraryReferencePresentationRevision" ADD CONSTRAINT "LibraryReferencePresentationRevision_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryReferencePresentationRevision" ADD CONSTRAINT "LibraryReferencePresentationRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Capture the existing text when tracking starts. Its editor and edit date
-- are unknown: do not attribute it to the reference creator or last reviewer.
INSERT INTO "LibraryReferencePresentationRevision" ("referenceId", "language", "markdown", "isBaseline")
SELECT "referenceId", "language", "descriptionMarkdown", true
FROM "LibraryReferenceTranslation";
