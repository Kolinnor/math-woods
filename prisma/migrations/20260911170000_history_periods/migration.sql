ALTER TYPE "HistoryMilestoneType" ADD VALUE 'PERIOD';
ALTER TABLE "HistoryMilestone" ADD COLUMN "endYear" INTEGER;
ALTER TABLE "HistoryMilestone" ADD CONSTRAINT "HistoryMilestone_year_order_check"
  CHECK ("endYear" IS NULL OR "endYear" >= "sortYear");
