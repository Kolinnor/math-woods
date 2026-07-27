CREATE TABLE "ProblemChallengeInvite" (
  "id" SERIAL NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "challengerId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "message" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedById" INTEGER,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProblemChallengeInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProblemChallengeInvite_tokenHash_key"
  ON "ProblemChallengeInvite"("tokenHash");

CREATE INDEX "ProblemChallengeInvite_challengerId_createdAt_idx"
  ON "ProblemChallengeInvite"("challengerId", "createdAt");

CREATE INDEX "ProblemChallengeInvite_problemId_idx"
  ON "ProblemChallengeInvite"("problemId");

CREATE INDEX "ProblemChallengeInvite_expiresAt_idx"
  ON "ProblemChallengeInvite"("expiresAt");

CREATE INDEX "ProblemChallengeInvite_acceptedById_idx"
  ON "ProblemChallengeInvite"("acceptedById");

ALTER TABLE "ProblemChallengeInvite"
  ADD CONSTRAINT "ProblemChallengeInvite_challengerId_fkey"
  FOREIGN KEY ("challengerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemChallengeInvite"
  ADD CONSTRAINT "ProblemChallengeInvite_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemChallengeInvite"
  ADD CONSTRAINT "ProblemChallengeInvite_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
