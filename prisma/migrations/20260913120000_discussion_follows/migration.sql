CREATE TABLE "DiscussionFollow" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER,
    "proofId" INTEGER,
    "conceptId" INTEGER,
    "following" BOOLEAN NOT NULL,
    CONSTRAINT "DiscussionFollow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiscussionFollow_one_target_check" CHECK (num_nonnulls("problemId", "proofId", "conceptId") = 1)
);

CREATE UNIQUE INDEX "DiscussionFollow_userId_problemId_key" ON "DiscussionFollow"("userId", "problemId");
CREATE UNIQUE INDEX "DiscussionFollow_userId_proofId_key" ON "DiscussionFollow"("userId", "proofId");
CREATE UNIQUE INDEX "DiscussionFollow_userId_conceptId_key" ON "DiscussionFollow"("userId", "conceptId");
CREATE INDEX "DiscussionFollow_problemId_idx" ON "DiscussionFollow"("problemId");
CREATE INDEX "DiscussionFollow_proofId_idx" ON "DiscussionFollow"("proofId");
CREATE INDEX "DiscussionFollow_conceptId_idx" ON "DiscussionFollow"("conceptId");

ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "ProblemProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
