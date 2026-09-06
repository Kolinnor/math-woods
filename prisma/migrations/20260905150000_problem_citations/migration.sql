ALTER TABLE "LibraryReference" ADD COLUMN "searchable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mergedIntoId" INTEGER;
ALTER TABLE "LibraryReference" ADD CONSTRAINT "LibraryReference_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "LibraryReference"("id") ON DELETE SET NULL;

ALTER TABLE "ProblemLibraryReference" ALTER COLUMN "referenceId" DROP NOT NULL,
  ADD COLUMN "citationKey" TEXT,
  ADD COLUMN "text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "url" TEXT,
  ADD COLUMN "spoiler" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ProblemLibraryReference" link
SET "citationKey" = 'legacy-' || link."id", "text" = ref."canonicalTitle", "url" = ref."url"
FROM "LibraryReference" ref WHERE ref."id" = link."referenceId";
ALTER TABLE "ProblemLibraryReference" ALTER COLUMN "citationKey" SET NOT NULL;
CREATE UNIQUE INDEX "ProblemLibraryReference_problemId_citationKey_key" ON "ProblemLibraryReference"("problemId", "citationKey");
ALTER TABLE "ProblemLibraryReference" DROP CONSTRAINT "ProblemLibraryReference_referenceId_fkey";
ALTER TABLE "ProblemLibraryReference" ADD CONSTRAINT "ProblemLibraryReference_referenceId_fkey"
  FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE SET NULL;

-- Incomplete imported BibTeX titles stay linked and readable, but are not suggestions.
UPDATE "LibraryReference" SET "searchable" = false
WHERE "canonicalTitle" ~ '^\s*@\w+\s*[{(]';
