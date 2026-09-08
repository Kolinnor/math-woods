ALTER TABLE "Mathematician"
  ADD COLUMN "lastEditedById" INTEGER,
  ADD COLUMN "needsReviewAfterEdit" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Mathematician" ADD CONSTRAINT "Mathematician_lastEditedById_fkey"
  FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
