-- CreateTable
CREATE TABLE "Quote" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attributedTo" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'Unknown',
    "provenanceDetails" TEXT,
    "noteMarkdown" TEXT,
    "noteHtml" TEXT,
    "contributorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteProblem" (
    "quoteId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,

    CONSTRAINT "QuoteProblem_pkey" PRIMARY KEY ("quoteId","problemId")
);

-- CreateTable
CREATE TABLE "QuoteConcept" (
    "quoteId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,

    CONSTRAINT "QuoteConcept_pkey" PRIMARY KEY ("quoteId","conceptId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_slug_key" ON "Quote"("slug");

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");

-- CreateIndex
CREATE INDEX "Quote_attributedTo_idx" ON "Quote"("attributedTo");

-- CreateIndex
CREATE INDEX "QuoteProblem_problemId_idx" ON "QuoteProblem"("problemId");

-- CreateIndex
CREATE INDEX "QuoteConcept_conceptId_idx" ON "QuoteConcept"("conceptId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteProblem" ADD CONSTRAINT "QuoteProblem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteProblem" ADD CONSTRAINT "QuoteProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteConcept" ADD CONSTRAINT "QuoteConcept_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteConcept" ADD CONSTRAINT "QuoteConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
