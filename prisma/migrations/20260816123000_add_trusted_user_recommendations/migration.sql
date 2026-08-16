ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRUSTED_USER_CANDIDATE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRUSTED_USER_PROMOTED';

CREATE TYPE "TrustedUserRecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'INVALIDATED');

CREATE TABLE "TrustedUserRecommendation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "notificationId" INTEGER,
    "decidedById" INTEGER,
    "reputation" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "status" "TrustedUserRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedUserRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedUserRecommendation_userId_key" ON "TrustedUserRecommendation"("userId");
CREATE UNIQUE INDEX "TrustedUserRecommendation_notificationId_key" ON "TrustedUserRecommendation"("notificationId");
CREATE INDEX "TrustedUserRecommendation_status_createdAt_idx" ON "TrustedUserRecommendation"("status", "createdAt");
CREATE INDEX "TrustedUserRecommendation_decidedById_idx" ON "TrustedUserRecommendation"("decidedById");

ALTER TABLE "TrustedUserRecommendation"
ADD CONSTRAINT "TrustedUserRecommendation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrustedUserRecommendation"
ADD CONSTRAINT "TrustedUserRecommendation_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrustedUserRecommendation"
ADD CONSTRAINT "TrustedUserRecommendation_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
