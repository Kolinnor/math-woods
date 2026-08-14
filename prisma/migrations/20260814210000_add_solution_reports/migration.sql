CREATE TYPE "ReportCategory" AS ENUM (
    'MATHEMATICAL_ERROR',
    'INCOMPLETE_ARGUMENT',
    'UNCLEAR_EXPLANATION',
    'IRRELEVANT_OR_ABUSIVE',
    'OTHER'
);

ALTER TYPE "NotificationType" ADD VALUE 'SOLUTION_REPORTED';

ALTER TABLE "Report"
ADD COLUMN "reviewerId" INTEGER,
ADD COLUMN "category" "ReportCategory",
ADD COLUMN "reviewerNote" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "Report_targetType_targetId_status_idx"
ON "Report"("targetType", "targetId", "status");

CREATE INDEX "Report_reporterId_targetType_targetId_status_idx"
ON "Report"("reporterId", "targetType", "targetId", "status");

CREATE INDEX "Report_reviewerId_idx" ON "Report"("reviewerId");

ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
