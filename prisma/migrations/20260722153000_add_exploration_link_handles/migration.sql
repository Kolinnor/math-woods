ALTER TABLE "ExplorationBlock"
  ADD COLUMN "continueTargetHandle" TEXT;

ALTER TABLE "ExplorationBlockOption"
  ADD COLUMN "targetHandle" TEXT;

ALTER TABLE "ExplorationBlockOutcome"
  ADD COLUMN "targetHandle" TEXT;
