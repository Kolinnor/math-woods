ALTER TABLE "KnownProblemSource"
ADD COLUMN "iconSize" INTEGER NOT NULL DEFAULT 40;

ALTER TABLE "KnownProblemSource"
ADD CONSTRAINT "KnownProblemSource_iconSize_check"
CHECK ("iconSize" BETWEEN 24 AND 72);
