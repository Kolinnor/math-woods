ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DAILY_CONCEPT_REVIEW';

CREATE TABLE "DailyConceptReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "notificationId" INTEGER,
    "assignedStatus" "ConceptStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DailyConceptReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyConceptReview_notificationId_key" ON "DailyConceptReview"("notificationId");
CREATE UNIQUE INDEX "DailyConceptReview_one_active_per_user_key"
ON "DailyConceptReview"("userId")
WHERE "completedAt" IS NULL;
CREATE INDEX "DailyConceptReview_userId_completedAt_createdAt_idx"
ON "DailyConceptReview"("userId", "completedAt", "createdAt");
CREATE INDEX "DailyConceptReview_conceptId_completedAt_idx"
ON "DailyConceptReview"("conceptId", "completedAt");

ALTER TABLE "DailyConceptReview"
ADD CONSTRAINT "DailyConceptReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyConceptReview"
ADD CONSTRAINT "DailyConceptReview_conceptId_fkey"
FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyConceptReview"
ADD CONSTRAINT "DailyConceptReview_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
