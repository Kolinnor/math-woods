CREATE TABLE "ProblemSpoilerTag" (
    "problemId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "ProblemSpoilerTag_pkey" PRIMARY KEY ("problemId","tagId")
);

ALTER TABLE "ProblemSpoilerTag" ADD CONSTRAINT "ProblemSpoilerTag_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemSpoilerTag" ADD CONSTRAINT "ProblemSpoilerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
