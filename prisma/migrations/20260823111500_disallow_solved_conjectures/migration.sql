UPDATE "ProblemAttempt" AS attempt
SET
  "status" = 'STARTED'::"AttemptStatus",
  "solvedAt" = NULL
FROM "Problem" AS problem
WHERE attempt."problemId" = problem."id"
  AND problem."isConjecture" = TRUE
  AND attempt."status" = 'SOLVED'::"AttemptStatus";
