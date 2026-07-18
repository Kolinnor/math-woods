CREATE TYPE "ExplorationOptionAction" AS ENUM ('STAY', 'PAGE', 'REVEAL');

CREATE TABLE "ExplorationBranch" (
    "id" SERIAL NOT NULL,
    "pageId" INTEGER NOT NULL,
    "parentBranchId" INTEGER,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplorationBranch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExplorationBlockOption"
ADD COLUMN "action" "ExplorationOptionAction" NOT NULL DEFAULT 'STAY',
ADD COLUMN "revealBranchId" INTEGER;

ALTER TABLE "ExplorationBlock"
ADD COLUMN "branchId" INTEGER;

UPDATE "ExplorationBlockOption"
SET "action" = 'PAGE'
WHERE "toPageId" IS NOT NULL;

UPDATE "ExplorationBlock"
SET "required" = true
WHERE "kind" = 'CHOICE';

CREATE UNIQUE INDEX "ExplorationBranch_pageId_key_key" ON "ExplorationBranch"("pageId", "key");
CREATE INDEX "ExplorationBranch_pageId_idx" ON "ExplorationBranch"("pageId");
CREATE INDEX "ExplorationBranch_parentBranchId_idx" ON "ExplorationBranch"("parentBranchId");
CREATE UNIQUE INDEX "ExplorationBlockOption_revealBranchId_key" ON "ExplorationBlockOption"("revealBranchId");
CREATE INDEX "ExplorationBlock_branchId_position_idx" ON "ExplorationBlock"("branchId", "position");

ALTER TABLE "ExplorationBranch"
ADD CONSTRAINT "ExplorationBranch_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "ExplorationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBranch"
ADD CONSTRAINT "ExplorationBranch_parentBranchId_fkey"
FOREIGN KEY ("parentBranchId") REFERENCES "ExplorationBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlock"
ADD CONSTRAINT "ExplorationBlock_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "ExplorationBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlockOption"
ADD CONSTRAINT "ExplorationBlockOption_revealBranchId_fkey"
FOREIGN KEY ("revealBranchId") REFERENCES "ExplorationBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
