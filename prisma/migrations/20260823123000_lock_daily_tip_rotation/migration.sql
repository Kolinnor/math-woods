CREATE TABLE "DailyTipRotationSelection" (
    "dateKey" VARCHAR(10) NOT NULL,
    "tipId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyTipRotationSelection_pkey" PRIMARY KEY ("dateKey")
);

CREATE INDEX "DailyTipRotationSelection_tipId_idx"
ON "DailyTipRotationSelection"("tipId");

ALTER TABLE "DailyTipRotationSelection"
ADD CONSTRAINT "DailyTipRotationSelection_tipId_fkey"
FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
