-- Existing free-text authors are preserved; structured rows are created on edit.
CREATE TABLE "LibraryReferenceAuthor" (
    "id" SERIAL NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "mathematicianId" INTEGER,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "LibraryReferenceAuthor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LibraryReferenceAuthor_referenceId_position_key" ON "LibraryReferenceAuthor"("referenceId", "position");
CREATE INDEX "LibraryReferenceAuthor_mathematicianId_idx" ON "LibraryReferenceAuthor"("mathematicianId");
ALTER TABLE "LibraryReferenceAuthor" ADD CONSTRAINT "LibraryReferenceAuthor_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryReferenceAuthor" ADD CONSTRAINT "LibraryReferenceAuthor_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
