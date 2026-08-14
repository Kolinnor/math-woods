CREATE TABLE "DailyTipSchedule" (
    "dateKey" VARCHAR(10) NOT NULL,
    "tipId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyTipSchedule_pkey" PRIMARY KEY ("dateKey")
);

CREATE INDEX "DailyTipSchedule_tipId_idx" ON "DailyTipSchedule"("tipId");

ALTER TABLE "DailyTipSchedule" ADD CONSTRAINT "DailyTipSchedule_tipId_fkey"
FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
