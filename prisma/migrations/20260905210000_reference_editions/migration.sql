ALTER TABLE "LibraryReference"
  ADD COLUMN "edition" TEXT,
  ADD COLUMN "volume" TEXT,
  ADD COLUMN "translator" TEXT,
  ADD COLUMN "editors" TEXT,
  ADD COLUMN "journal" TEXT,
  ADD COLUMN "issue" TEXT,
  ADD COLUMN "pages" TEXT,
  ADD COLUMN "workId" INTEGER;
ALTER TABLE "LibraryReference" ADD CONSTRAINT "LibraryReference_workId_fkey"
  FOREIGN KEY ("workId") REFERENCES "LibraryReference"("id") ON DELETE SET NULL;
ALTER TABLE "LibraryReference" ADD CONSTRAINT "LibraryReference_work_not_self" CHECK ("workId" IS NULL OR "workId" <> id);
CREATE INDEX "LibraryReference_workId_idx" ON "LibraryReference"("workId");
