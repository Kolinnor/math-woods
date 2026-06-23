ALTER TYPE "NotificationType" ADD VALUE 'SITE_ERROR_REPORTED';

CREATE TABLE "ErrorReport" (
  "id" SERIAL NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "digest" TEXT,
  "path" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'client',
  "userAgent" TEXT,
  "userId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewerNote" TEXT,

  CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorReport_createdAt_idx" ON "ErrorReport"("createdAt");
CREATE INDEX "ErrorReport_reviewedAt_createdAt_idx" ON "ErrorReport"("reviewedAt", "createdAt");
CREATE INDEX "ErrorReport_userId_createdAt_idx" ON "ErrorReport"("userId", "createdAt");

ALTER TABLE "ErrorReport"
  ADD CONSTRAINT "ErrorReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
