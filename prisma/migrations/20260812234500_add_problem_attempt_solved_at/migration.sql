ALTER TABLE "ProblemAttempt" ADD COLUMN "solvedAt" TIMESTAMP(3);

UPDATE "ProblemAttempt"
SET "solvedAt" = "updatedAt"
WHERE "status" = 'SOLVED';
