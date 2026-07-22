CREATE TABLE "ExplorationBlockProblemGroup" (
  "id" SERIAL NOT NULL,
  "blockId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExplorationBlockProblemGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExplorationBlockProblem" (
  "id" SERIAL NOT NULL,
  "groupId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExplorationBlockProblem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExplorationBlockProblemGroup_blockId_position_idx"
  ON "ExplorationBlockProblemGroup"("blockId", "position");

CREATE UNIQUE INDEX "ExplorationBlockProblem_groupId_problemId_key"
  ON "ExplorationBlockProblem"("groupId", "problemId");

CREATE INDEX "ExplorationBlockProblem_groupId_position_idx"
  ON "ExplorationBlockProblem"("groupId", "position");

CREATE INDEX "ExplorationBlockProblem_problemId_idx"
  ON "ExplorationBlockProblem"("problemId");

ALTER TABLE "ExplorationBlockProblemGroup"
  ADD CONSTRAINT "ExplorationBlockProblemGroup_blockId_fkey"
  FOREIGN KEY ("blockId") REFERENCES "ExplorationBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlockProblem"
  ADD CONSTRAINT "ExplorationBlockProblem_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ExplorationBlockProblemGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlockProblem"
  ADD CONSTRAINT "ExplorationBlockProblem_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
