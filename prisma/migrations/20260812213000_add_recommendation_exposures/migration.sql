CREATE TABLE "ProblemRecommendationExposure" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "translationGroupId" TEXT NOT NULL,
    "exposureCount" INTEGER NOT NULL DEFAULT 1,
    "firstOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemRecommendationExposure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProblemRecommendationExposure_userId_translationGroupId_key"
ON "ProblemRecommendationExposure"("userId", "translationGroupId");
CREATE INDEX "ProblemRecommendationExposure_userId_lastOpenedAt_idx"
ON "ProblemRecommendationExposure"("userId", "lastOpenedAt");
CREATE INDEX "ProblemRecommendationExposure_problemId_idx"
ON "ProblemRecommendationExposure"("problemId");

ALTER TABLE "ProblemRecommendationExposure"
ADD CONSTRAINT "ProblemRecommendationExposure_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemRecommendationExposure"
ADD CONSTRAINT "ProblemRecommendationExposure_problemId_fkey"
FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
