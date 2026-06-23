CREATE TABLE "ProblemRelationGroup" (
    "id" SERIAL NOT NULL,
    "sourceProblemId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemRelationGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemRelation" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "targetProblemId" INTEGER NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProblemRelationGroup_sourceProblemId_title_key" ON "ProblemRelationGroup"("sourceProblemId", "title");
CREATE INDEX "ProblemRelationGroup_sourceProblemId_position_idx" ON "ProblemRelationGroup"("sourceProblemId", "position");
CREATE UNIQUE INDEX "ProblemRelation_groupId_targetProblemId_key" ON "ProblemRelation"("groupId", "targetProblemId");
CREATE INDEX "ProblemRelation_groupId_position_idx" ON "ProblemRelation"("groupId", "position");
CREATE INDEX "ProblemRelation_targetProblemId_idx" ON "ProblemRelation"("targetProblemId");

ALTER TABLE "ProblemRelationGroup" ADD CONSTRAINT "ProblemRelationGroup_sourceProblemId_fkey" FOREIGN KEY ("sourceProblemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemRelation" ADD CONSTRAINT "ProblemRelation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProblemRelationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemRelation" ADD CONSTRAINT "ProblemRelation_targetProblemId_fkey" FOREIGN KEY ("targetProblemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
