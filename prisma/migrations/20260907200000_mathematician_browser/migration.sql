ALTER TABLE "Mathematician" ADD COLUMN "periodStartYear" INTEGER, ADD COLUMN "periodEndYear" INTEGER;
ALTER TABLE "Mathematician" ADD CONSTRAINT "Mathematician_period_order_check"
  CHECK (("periodStartYear" IS NULL OR "periodStartYear" <> 0)
    AND ("periodEndYear" IS NULL OR "periodEndYear" <> 0)
    AND ("periodStartYear" IS NULL OR "periodEndYear" IS NULL OR "periodStartYear" <= "periodEndYear"));
ALTER TABLE "MathematicianTranslation" ADD COLUMN "sortName" TEXT NOT NULL DEFAULT '';
