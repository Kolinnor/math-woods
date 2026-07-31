ALTER TABLE "ChatMessage"
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "imageKey" TEXT,
  ADD COLUMN "imageWidth" INTEGER,
  ADD COLUMN "imageHeight" INTEGER,
  ADD COLUMN "imageBytes" INTEGER;
