ALTER TABLE "Problem" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Problem" ADD COLUMN "translationGroupId" TEXT;
UPDATE "Problem" SET "translationGroupId" = 'problem-' || "id" WHERE "translationGroupId" IS NULL;
ALTER TABLE "Problem" ALTER COLUMN "translationGroupId" SET NOT NULL;
CREATE INDEX "Problem_language_status_createdAt_idx" ON "Problem"("language", "status", "createdAt");
CREATE INDEX "Problem_translationGroupId_idx" ON "Problem"("translationGroupId");
CREATE UNIQUE INDEX "Problem_translationGroupId_language_key" ON "Problem"("translationGroupId", "language");

ALTER TABLE "Concept" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Concept" ADD COLUMN "translationGroupId" TEXT;
UPDATE "Concept" SET "translationGroupId" = 'concept-' || "id" WHERE "translationGroupId" IS NULL;
ALTER TABLE "Concept" ALTER COLUMN "translationGroupId" SET NOT NULL;
CREATE INDEX "Concept_language_updatedAt_idx" ON "Concept"("language", "updatedAt");
CREATE INDEX "Concept_translationGroupId_idx" ON "Concept"("translationGroupId");
CREATE UNIQUE INDEX "Concept_translationGroupId_language_key" ON "Concept"("translationGroupId", "language");

ALTER TABLE "Playlist" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Playlist" ADD COLUMN "translationGroupId" TEXT;
UPDATE "Playlist" SET "translationGroupId" = 'playlist-' || "id" WHERE "translationGroupId" IS NULL;
ALTER TABLE "Playlist" ALTER COLUMN "translationGroupId" SET NOT NULL;
CREATE INDEX "Playlist_language_updatedAt_idx" ON "Playlist"("language", "updatedAt");
CREATE INDEX "Playlist_translationGroupId_idx" ON "Playlist"("translationGroupId");
CREATE UNIQUE INDEX "Playlist_translationGroupId_language_key" ON "Playlist"("translationGroupId", "language");

ALTER TABLE "Quote" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Quote" ADD COLUMN "translationGroupId" TEXT;
UPDATE "Quote" SET "translationGroupId" = 'quote-' || "id" WHERE "translationGroupId" IS NULL;
ALTER TABLE "Quote" ALTER COLUMN "translationGroupId" SET NOT NULL;
CREATE INDEX "Quote_language_createdAt_idx" ON "Quote"("language", "createdAt");
CREATE INDEX "Quote_translationGroupId_idx" ON "Quote"("translationGroupId");
CREATE UNIQUE INDEX "Quote_translationGroupId_language_key" ON "Quote"("translationGroupId", "language");
