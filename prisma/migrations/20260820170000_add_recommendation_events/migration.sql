CREATE TYPE "RecommendationEventType" AS ENUM (
  'OPENED',
  'STARTED',
  'SOLVED',
  'BLOCKED',
  'TOO_HARD',
  'TOO_EASY',
  'EASIER_REQUESTED'
);

CREATE TABLE "RecommendationEvent" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "problemId" INTEGER,
  "translationGroupId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "eventType" "RecommendationEventType" NOT NULL,
  "dateKey" VARCHAR(10) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecommendationEvent_userId_dateKey_scopeKey_eventType_key"
  ON "RecommendationEvent"("userId", "dateKey", "scopeKey", "eventType");
CREATE INDEX "RecommendationEvent_userId_createdAt_idx"
  ON "RecommendationEvent"("userId", "createdAt");
CREATE INDEX "RecommendationEvent_problemId_idx"
  ON "RecommendationEvent"("problemId");
CREATE INDEX "RecommendationEvent_translationGroupId_idx"
  ON "RecommendationEvent"("translationGroupId");

ALTER TABLE "RecommendationEvent"
  ADD CONSTRAINT "RecommendationEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationEvent"
  ADD CONSTRAINT "RecommendationEvent_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
