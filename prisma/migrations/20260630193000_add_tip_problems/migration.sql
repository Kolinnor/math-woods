CREATE TABLE "TipProblem" (
  "tipId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "TipProblem_pkey" PRIMARY KEY ("tipId", "problemId")
);

CREATE INDEX "TipProblem_tipId_position_idx" ON "TipProblem"("tipId", "position");
CREATE INDEX "TipProblem_problemId_idx" ON "TipProblem"("problemId");

ALTER TABLE "TipProblem"
  ADD CONSTRAINT "TipProblem_tipId_fkey"
  FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TipProblem"
  ADD CONSTRAINT "TipProblem_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
