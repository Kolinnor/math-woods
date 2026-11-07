ALTER TABLE "Problem"
  ADD COLUMN "historyMarkdown" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "historyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "historySpoiler" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Concept"
  ADD COLUMN "historyMarkdown" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "historyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "historySpoiler" BOOLEAN NOT NULL DEFAULT false;
