-- CreateEnum
CREATE TYPE "ConceptMergeKind" AS ENUM ('TRANSLATION_LINK', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ConceptMergeStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'INVALIDATED');

-- CreateTable
CREATE TABLE "ConceptMergeProposal" (
    "id" SERIAL NOT NULL,
    "kind" "ConceptMergeKind" NOT NULL,
    "status" "ConceptMergeStatus" NOT NULL DEFAULT 'PENDING',
    "sourceConceptId" INTEGER NOT NULL,
    "targetConceptId" INTEGER NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "targetSlug" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "targetTitle" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "sourceTranslationGroupId" TEXT NOT NULL,
    "targetTranslationGroupId" TEXT NOT NULL,
    "reason" TEXT,
    "proposedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "resultConceptId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ConceptMergeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptRedirect" (
    "id" SERIAL NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "sourceConceptId" INTEGER NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "sourceTranslationGroupId" TEXT NOT NULL,
    "targetConceptId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptMergeContributor" (
    "conceptId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceConceptId" INTEGER NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptMergeContributor_pkey" PRIMARY KEY ("conceptId","userId")
);

-- CreateIndex
CREATE INDEX "ConceptMergeProposal_status_createdAt_idx" ON "ConceptMergeProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ConceptMergeProposal_sourceConceptId_targetConceptId_status_idx" ON "ConceptMergeProposal"("sourceConceptId", "targetConceptId", "status");

-- CreateIndex
CREATE INDEX "ConceptMergeProposal_proposedById_createdAt_idx" ON "ConceptMergeProposal"("proposedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptRedirect_sourceSlug_key" ON "ConceptRedirect"("sourceSlug");

-- CreateIndex
CREATE INDEX "ConceptRedirect_targetConceptId_createdAt_idx" ON "ConceptRedirect"("targetConceptId", "createdAt");

-- CreateIndex
CREATE INDEX "ConceptRedirect_sourceConceptId_idx" ON "ConceptRedirect"("sourceConceptId");

-- CreateIndex
CREATE INDEX "ConceptMergeContributor_userId_creditedAt_idx" ON "ConceptMergeContributor"("userId", "creditedAt");

-- CreateIndex
CREATE INDEX "ConceptMergeContributor_sourceConceptId_idx" ON "ConceptMergeContributor"("sourceConceptId");

-- AddForeignKey
ALTER TABLE "ConceptMergeProposal" ADD CONSTRAINT "ConceptMergeProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptMergeProposal" ADD CONSTRAINT "ConceptMergeProposal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRedirect" ADD CONSTRAINT "ConceptRedirect_targetConceptId_fkey" FOREIGN KEY ("targetConceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRedirect" ADD CONSTRAINT "ConceptRedirect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptMergeContributor" ADD CONSTRAINT "ConceptMergeContributor_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptMergeContributor" ADD CONSTRAINT "ConceptMergeContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
