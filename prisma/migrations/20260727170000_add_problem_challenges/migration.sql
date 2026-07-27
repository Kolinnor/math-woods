ALTER TYPE "NotificationType" ADD VALUE 'PROBLEM_CHALLENGE';

CREATE TABLE "ProblemChallenge" (
  "id" SERIAL NOT NULL,
  "challengerId" INTEGER NOT NULL,
  "recipientId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProblemChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemChallenge_recipientId_createdAt_idx"
  ON "ProblemChallenge"("recipientId", "createdAt");

CREATE INDEX "ProblemChallenge_challengerId_createdAt_idx"
  ON "ProblemChallenge"("challengerId", "createdAt");

CREATE INDEX "ProblemChallenge_problemId_idx"
  ON "ProblemChallenge"("problemId");

ALTER TABLE "ProblemChallenge"
  ADD CONSTRAINT "ProblemChallenge_challengerId_fkey"
  FOREIGN KEY ("challengerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemChallenge"
  ADD CONSTRAINT "ProblemChallenge_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemChallenge"
  ADD CONSTRAINT "ProblemChallenge_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
