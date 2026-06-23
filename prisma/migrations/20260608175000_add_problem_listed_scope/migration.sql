ALTER TABLE "Problem" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Problem_listed_status_createdAt_idx" ON "Problem"("listed", "status", "createdAt");
