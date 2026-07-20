ALTER TABLE "Problem"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PageRevision"
ADD COLUMN "problemVersion" INTEGER,
ADD COLUMN "problemSnapshot" JSONB;

CREATE INDEX "PageRevision_pageType_pageId_problemVersion_idx"
ON "PageRevision"("pageType", "pageId", "problemVersion");
