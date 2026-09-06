-- Existing records are upgraded once; later intentional blank values stay blank.
ALTER TABLE "LibraryReference" ADD COLUMN "bibliographyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LibraryReference" ALTER COLUMN "bibliographyVersion" SET DEFAULT 1;

ALTER TABLE "ConceptLibraryReference"
  ALTER COLUMN "referenceId" DROP NOT NULL,
  ADD COLUMN "citationKey" TEXT,
  ADD COLUMN "text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "url" TEXT;
UPDATE "ConceptLibraryReference" c SET
  "citationKey" = 'catalogue-' || c.id,
  "text" = COALESCE(NULLIF(concat_ws(' — ', NULLIF(r.authors, ''), r."canonicalTitle"), ''), 'Reference ' || c.id),
  "url" = r.url
FROM "LibraryReference" r WHERE r.id = c."referenceId";
UPDATE "ConceptLibraryReference" SET "citationKey" = 'catalogue-' || id WHERE "citationKey" IS NULL;
ALTER TABLE "ConceptLibraryReference" ALTER COLUMN "citationKey" SET NOT NULL;
ALTER TABLE "ConceptLibraryReference" DROP CONSTRAINT "ConceptLibraryReference_referenceId_fkey";
ALTER TABLE "ConceptLibraryReference" ADD CONSTRAINT "ConceptLibraryReference_referenceId_fkey"
  FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX "ConceptLibraryReference_conceptId_citationKey_key" ON "ConceptLibraryReference"("conceptId", "citationKey");

-- Retain any legacy citation not represented by an existing catalogue link,
-- including distinct notes on the same work. Do not delete the old rows.
INSERT INTO "ConceptLibraryReference" ("conceptId", "citationKey", "text", "url", "note", "role", "position")
SELECT c."conceptId", 'legacy-' || c.id, c.title, c.url, c.note, 'FURTHER_READING',
  COALESCE((SELECT MAX(l.position) + 1 FROM "ConceptLibraryReference" l WHERE l."conceptId" = c."conceptId"), 0) + c.position
FROM "ConceptReference" c
WHERE NOT EXISTS (
  SELECT 1 FROM "ConceptLibraryReference" l JOIN "LibraryReference" r ON r.id = l."referenceId"
  WHERE l."conceptId" = c."conceptId" AND l.note IS NOT DISTINCT FROM c.note
    AND ((c.url IS NOT NULL AND c.url = r.url) OR c.title = r."canonicalTitle")
);
