CREATE TYPE "ProblemDifficultyReaction" AS ENUM ('TOO_HARD', 'TOO_EASY', 'FEELS_RIGHT');
CREATE TYPE "ProblemPreferenceReaction" AS ENUM ('MORE_LIKE_THIS', 'LESS_LIKE_THIS');

CREATE TABLE "ProblemReaction" (
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "difficultyReaction" "ProblemDifficultyReaction",
    "preferenceReaction" "ProblemPreferenceReaction",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemReaction_pkey" PRIMARY KEY ("userId", "problemId")
);

CREATE INDEX "ProblemReaction_problemId_idx" ON "ProblemReaction"("problemId");
CREATE INDEX "ProblemReaction_userId_updatedAt_idx" ON "ProblemReaction"("userId", "updatedAt");

ALTER TABLE "ProblemReaction" ADD CONSTRAINT "ProblemReaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemReaction" ADD CONSTRAINT "ProblemReaction_problemId_fkey"
FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
