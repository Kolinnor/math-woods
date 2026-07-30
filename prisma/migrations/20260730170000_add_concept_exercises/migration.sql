CREATE TABLE "ConceptExercise" (
  "conceptId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "ConceptExercise_pkey" PRIMARY KEY ("conceptId", "problemId")
);

CREATE UNIQUE INDEX "ConceptExercise_conceptId_position_key"
ON "ConceptExercise"("conceptId", "position");

CREATE INDEX "ConceptExercise_problemId_idx"
ON "ConceptExercise"("problemId");

ALTER TABLE "ConceptExercise"
ADD CONSTRAINT "ConceptExercise_conceptId_fkey"
FOREIGN KEY ("conceptId") REFERENCES "Concept"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptExercise"
ADD CONSTRAINT "ConceptExercise_problemId_fkey"
FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ConceptExercise" ("conceptId", "problemId", "position")
SELECT "conceptId", "problemId", "position"
FROM (
  SELECT
    "linked"."conceptId",
    "linked"."problemId",
    (ROW_NUMBER() OVER (
      PARTITION BY "linked"."conceptId"
      ORDER BY "linked"."updatedAt" DESC, "linked"."problemId" ASC
    ) - 1)::INTEGER AS "position"
  FROM (
    SELECT DISTINCT
      "Concept"."id" AS "conceptId",
      "Problem"."id" AS "problemId",
      "Problem"."updatedAt"
    FROM "Concept"
    INNER JOIN "InternalLink"
      ON "InternalLink"."targetSlug" = "Concept"."slug"
      AND "InternalLink"."sourceType" = 'PROBLEM'
      AND "InternalLink"."exists" = true
    INNER JOIN "Problem"
      ON "Problem"."id" = "InternalLink"."sourceId"
      AND "Problem"."isExercise" = true
      AND "Problem"."status" = 'PUBLISHED'
      AND "Problem"."listed" = true
  ) AS "linked"
) AS "ordered";
