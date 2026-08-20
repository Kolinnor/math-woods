ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SITE_IMPROVEMENT_COMPLETED';

CREATE TYPE "SiteImprovementCompletionReviewStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'FOLLOW_UP',
  'INVALIDATED'
);

CREATE TABLE "SiteImprovementCompletionReview" (
  "id" SERIAL NOT NULL,
  "improvementId" INTEGER NOT NULL,
  "notificationId" INTEGER,
  "status" "SiteImprovementCompletionReviewStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "SiteImprovementCompletionReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteImprovementCompletionReview_notificationId_key"
ON "SiteImprovementCompletionReview"("notificationId");

CREATE INDEX "SiteImprovementCompletionReview_improvementId_status_createdAt_idx"
ON "SiteImprovementCompletionReview"("improvementId", "status", "createdAt");

ALTER TABLE "SiteImprovementCompletionReview"
ADD CONSTRAINT "SiteImprovementCompletionReview_improvementId_fkey"
FOREIGN KEY ("improvementId") REFERENCES "SiteImprovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SiteImprovementCompletionReview"
ADD CONSTRAINT "SiteImprovementCompletionReview_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
