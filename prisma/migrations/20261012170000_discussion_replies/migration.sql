ALTER TABLE "ConceptTalkPost" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "ProofComment" ADD COLUMN "parentId" INTEGER;

-- The legacy scalar was unused; discard invalid legacy references before adding its FK.
UPDATE "DiscussionPost" AS child SET "parentId" = NULL
WHERE "parentId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "DiscussionPost" AS parent
  WHERE parent.id = child."parentId" AND parent."threadId" = child."threadId" AND parent.id <> child.id
);

CREATE INDEX "ConceptTalkPost_parentId_idx" ON "ConceptTalkPost"("parentId");
CREATE INDEX "ProofComment_parentId_idx" ON "ProofComment"("parentId");
CREATE INDEX "DiscussionPost_parentId_idx" ON "DiscussionPost"("parentId");
ALTER TABLE "ConceptTalkPost" ADD CONSTRAINT "ConceptTalkPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ConceptTalkPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProofComment" ADD CONSTRAINT "ProofComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProofComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
