CREATE TABLE "ProblemHint" (
    "id" SERIAL NOT NULL,
    "problemId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemHint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemHint_problemId_position_idx" ON "ProblemHint"("problemId", "position");
CREATE INDEX "ProblemHint_authorId_idx" ON "ProblemHint"("authorId");

ALTER TABLE "ProblemHint" ADD CONSTRAINT "ProblemHint_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemHint" ADD CONSTRAINT "ProblemHint_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
