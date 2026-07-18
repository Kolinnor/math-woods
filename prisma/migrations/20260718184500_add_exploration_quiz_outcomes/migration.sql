CREATE TYPE "ExplorationOutcomeKind" AS ENUM ('ANSWER', 'CORRECT', 'INCORRECT', 'COMBINATION');

CREATE TABLE "ExplorationBlockOutcome" (
    "id" SERIAL NOT NULL,
    "blockId" INTEGER NOT NULL,
    "kind" "ExplorationOutcomeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "toPageId" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplorationBlockOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExplorationOutcomeOption" (
    "outcomeId" INTEGER NOT NULL,
    "optionId" INTEGER NOT NULL,

    CONSTRAINT "ExplorationOutcomeOption_pkey" PRIMARY KEY ("outcomeId", "optionId")
);

CREATE INDEX "ExplorationBlockOutcome_blockId_position_idx" ON "ExplorationBlockOutcome"("blockId", "position");
CREATE INDEX "ExplorationBlockOutcome_toPageId_idx" ON "ExplorationBlockOutcome"("toPageId");
CREATE INDEX "ExplorationOutcomeOption_optionId_idx" ON "ExplorationOutcomeOption"("optionId");

ALTER TABLE "ExplorationBlockOutcome"
ADD CONSTRAINT "ExplorationBlockOutcome_blockId_fkey"
FOREIGN KEY ("blockId") REFERENCES "ExplorationBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlockOutcome"
ADD CONSTRAINT "ExplorationBlockOutcome_toPageId_fkey"
FOREIGN KEY ("toPageId") REFERENCES "ExplorationPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExplorationOutcomeOption"
ADD CONSTRAINT "ExplorationOutcomeOption_outcomeId_fkey"
FOREIGN KEY ("outcomeId") REFERENCES "ExplorationBlockOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationOutcomeOption"
ADD CONSTRAINT "ExplorationOutcomeOption_optionId_fkey"
FOREIGN KEY ("optionId") REFERENCES "ExplorationBlockOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ExplorationBlockOutcome" ("blockId", "kind", "label", "toPageId", "position")
SELECT option."blockId", 'ANSWER', option."label", option."toPageId", option."position"
FROM "ExplorationBlockOption" option
JOIN "ExplorationBlock" block ON block."id" = option."blockId"
WHERE block."kind" = 'QUIZ' AND option."toPageId" IS NOT NULL;

INSERT INTO "ExplorationOutcomeOption" ("outcomeId", "optionId")
SELECT outcome."id", option."id"
FROM "ExplorationBlockOutcome" outcome
JOIN "ExplorationBlockOption" option
  ON option."blockId" = outcome."blockId"
  AND option."position" = outcome."position"
WHERE outcome."kind" = 'ANSWER';
