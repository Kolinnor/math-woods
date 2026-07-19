CREATE TABLE "ExplorationBlockFolder" (
  "id" SERIAL NOT NULL,
  "playlistId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExplorationBlockFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExplorationBlock" ADD COLUMN "folderId" INTEGER;

CREATE INDEX "ExplorationBlockFolder_playlistId_position_idx"
  ON "ExplorationBlockFolder"("playlistId", "position");

CREATE INDEX "ExplorationBlock_folderId_idx" ON "ExplorationBlock"("folderId");

ALTER TABLE "ExplorationBlockFolder"
  ADD CONSTRAINT "ExplorationBlockFolder_playlistId_fkey"
  FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExplorationBlock"
  ADD CONSTRAINT "ExplorationBlock_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "ExplorationBlockFolder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
