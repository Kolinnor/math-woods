CREATE TYPE "ConceptKind" AS ENUM ('DEFINITION', 'THEOREM', 'INTUITIVE_NOTION');

ALTER TABLE "Concept"
ADD COLUMN "kind" "ConceptKind" NOT NULL DEFAULT 'DEFINITION';

ALTER TABLE "PageRevision"
ADD COLUMN "conceptKind" "ConceptKind";

WITH "LatestConceptRevision" AS (
  SELECT DISTINCT ON ("pageId") "id", "pageId"
  FROM "PageRevision"
  WHERE "pageType" = 'CONCEPT'
  ORDER BY "pageId", "createdAt" DESC, "id" DESC
)
UPDATE "PageRevision" AS revision
SET "conceptKind" = concept."kind"
FROM "LatestConceptRevision" AS latest
JOIN "Concept" AS concept ON concept."id" = latest."pageId"
WHERE revision."id" = latest."id";

CREATE INDEX "Concept_language_kind_updatedAt_idx"
ON "Concept"("language", "kind", "updatedAt");
