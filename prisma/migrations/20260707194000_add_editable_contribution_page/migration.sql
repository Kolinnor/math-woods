CREATE TABLE "ContributionPageContent" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "requestEyebrow" TEXT NOT NULL,
    "requestTitle" TEXT NOT NULL,
    "requestIntro" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionPageContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionPageSection" (
    "id" SERIAL NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionPageSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContributionPageSection_position_idx" ON "ContributionPageSection"("position");
