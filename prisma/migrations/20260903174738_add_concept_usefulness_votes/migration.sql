-- CreateTable
CREATE TABLE "ConceptUsefulnessVote" (
    "userId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptUsefulnessVote_pkey" PRIMARY KEY ("userId","conceptId")
);

-- CreateIndex
CREATE INDEX "ConceptUsefulnessVote_conceptId_idx" ON "ConceptUsefulnessVote"("conceptId");

-- AddForeignKey
ALTER TABLE "ConceptUsefulnessVote" ADD CONSTRAINT "ConceptUsefulnessVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptUsefulnessVote" ADD CONSTRAINT "ConceptUsefulnessVote_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
