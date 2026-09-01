CREATE TABLE "ConceptContributorGuideContent" (
  "language" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConceptContributorGuideContent_pkey" PRIMARY KEY ("language")
);
