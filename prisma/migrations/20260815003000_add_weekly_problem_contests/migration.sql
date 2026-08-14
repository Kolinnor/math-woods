CREATE TYPE "ContestPlacement" AS ENUM ('WINNER', 'HONORABLE_MENTION');

ALTER TYPE "NotificationType" ADD VALUE 'CONTEST_UPDATE';

CREATE TABLE "ProblemContest" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "startDateKey" VARCHAR(10) NOT NULL,
    "endDateKey" VARCHAR(10) NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleFr" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "summaryFr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyFr" TEXT NOT NULL,
    "rulesEn" TEXT NOT NULL,
    "rulesFr" TEXT NOT NULL,
    "criteriaEn" TEXT NOT NULL,
    "criteriaFr" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imagePositionX" INTEGER NOT NULL DEFAULT 50,
    "imagePositionY" INTEGER NOT NULL DEFAULT 50,
    "rewardPoints" INTEGER NOT NULL DEFAULT 300,
    "publishedAt" TIMESTAMP(3),
    "resultsPublishedAt" TIMESTAMP(3),
    "launchNotificationSentAt" TIMESTAMP(3),
    "deadlineReminderSentAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemContest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemContestSubmission" (
    "id" SERIAL NOT NULL,
    "contestId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "translationGroupId" TEXT NOT NULL,
    "placement" "ContestPlacement",
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemContestSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProblemContest_slug_key" ON "ProblemContest"("slug");
CREATE UNIQUE INDEX "ProblemContest_startDateKey_key" ON "ProblemContest"("startDateKey");
CREATE INDEX "ProblemContest_publishedAt_startDateKey_endDateKey_idx" ON "ProblemContest"("publishedAt", "startDateKey", "endDateKey");
CREATE UNIQUE INDEX "ProblemContestSubmission_contestId_userId_key" ON "ProblemContestSubmission"("contestId", "userId");
CREATE UNIQUE INDEX "ProblemContestSubmission_contestId_translationGroupId_key" ON "ProblemContestSubmission"("contestId", "translationGroupId");
CREATE INDEX "ProblemContestSubmission_contestId_placement_submittedAt_idx" ON "ProblemContestSubmission"("contestId", "placement", "submittedAt");
CREATE INDEX "ProblemContestSubmission_userId_submittedAt_idx" ON "ProblemContestSubmission"("userId", "submittedAt");

ALTER TABLE "ProblemContest" ADD CONSTRAINT "ProblemContest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProblemContestSubmission" ADD CONSTRAINT "ProblemContestSubmission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "ProblemContest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemContestSubmission" ADD CONSTRAINT "ProblemContestSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemContestSubmission" ADD CONSTRAINT "ProblemContestSubmission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
