-- Problem deletion is a soft archive, so the foreign-key cascade never ran.
DELETE FROM "ProblemContestSubmission" AS submission
USING "Problem" AS problem
WHERE submission."problemId" = problem."id"
  AND problem."status" = 'ARCHIVED';
