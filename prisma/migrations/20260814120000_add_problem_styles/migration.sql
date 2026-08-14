CREATE TYPE "ProblemStyle" AS ENUM (
  'PROOF',
  'CALCULATION',
  'CONSTRUCTION',
  'COUNTEREXAMPLE',
  'CLASSIFICATION',
  'OPTIMIZATION',
  'VISUAL',
  'ALGORITHMIC',
  'PUZZLE',
  'TRICK_QUESTION',
  'MULTIPLE_APPROACHES'
);

ALTER TABLE "Problem"
  ADD COLUMN "isConjecture" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "styles" "ProblemStyle"[] NOT NULL DEFAULT ARRAY[]::"ProblemStyle"[];

UPDATE "Problem" AS problem
SET "isConjecture" = true
WHERE EXISTS (
  SELECT 1
  FROM "ProblemTag" AS problem_tag
  JOIN "Tag" AS tag ON tag.id = problem_tag."tagId"
  WHERE problem_tag."problemId" = problem.id
    AND tag.slug = 'conjecture'
);

WITH mapped_styles AS (
  SELECT
    problem_tag."problemId",
    CASE
      WHEN tag.slug = 'proof' THEN 'PROOF'::"ProblemStyle"
      WHEN tag.slug IN ('calculation', 'computation') THEN 'CALCULATION'::"ProblemStyle"
      WHEN tag.slug = 'construction' THEN 'CONSTRUCTION'::"ProblemStyle"
      WHEN tag.slug IN ('counterexample', 'counter-example') THEN 'COUNTEREXAMPLE'::"ProblemStyle"
      WHEN tag.slug = 'classification' THEN 'CLASSIFICATION'::"ProblemStyle"
      WHEN tag.slug IN ('optimization', 'optimisation') THEN 'OPTIMIZATION'::"ProblemStyle"
      WHEN tag.slug = 'visual' THEN 'VISUAL'::"ProblemStyle"
      WHEN tag.slug IN ('algorithm', 'algorithmic') THEN 'ALGORITHMIC'::"ProblemStyle"
      WHEN tag.slug = 'puzzle' THEN 'PUZZLE'::"ProblemStyle"
      WHEN tag.slug IN ('trick-question', 'trick') THEN 'TRICK_QUESTION'::"ProblemStyle"
      WHEN tag.slug IN ('multiple-approaches', 'multiple-approach') THEN 'MULTIPLE_APPROACHES'::"ProblemStyle"
      ELSE NULL
    END AS style
  FROM "ProblemTag" AS problem_tag
  JOIN "Tag" AS tag ON tag.id = problem_tag."tagId"
), aggregated_styles AS (
  SELECT "problemId", array_agg(DISTINCT style) AS styles
  FROM mapped_styles
  WHERE style IS NOT NULL
  GROUP BY "problemId"
)
UPDATE "Problem" AS problem
SET styles = aggregated_styles.styles
FROM aggregated_styles
WHERE problem.id = aggregated_styles."problemId";
