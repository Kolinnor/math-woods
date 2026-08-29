ALTER TABLE "KnownProblemSource"
DROP CONSTRAINT "KnownProblemSource_iconSize_check";

ALTER TABLE "KnownProblemSource"
ADD CONSTRAINT "KnownProblemSource_iconSize_check"
CHECK ("iconSize" BETWEEN 24 AND 144);
