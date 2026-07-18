ALTER TABLE "ExplorationBlock"
  ADD COLUMN "autoContinue" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ExplorationSession"
  ADD COLUMN "pathBlockKeys" JSONB NOT NULL DEFAULT '[]';
