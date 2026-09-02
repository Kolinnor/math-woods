ALTER TABLE "User"
  ADD COLUMN "lastSeenAnnouncementAt" TIMESTAMP(3);

CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");

ALTER TABLE "Announcement"
    ADD CONSTRAINT "Announcement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
