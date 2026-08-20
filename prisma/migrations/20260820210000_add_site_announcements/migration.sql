-- CreateTable
CREATE TABLE "SiteAnnouncement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "audienceRoles" "Role"[],
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SiteAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAnnouncementRecipient" (
    "announcementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteAnnouncementRecipient_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "SiteAnnouncement_createdAt_idx" ON "SiteAnnouncement"("createdAt");

-- CreateIndex
CREATE INDEX "SiteAnnouncement_cancelledAt_createdAt_idx" ON "SiteAnnouncement"("cancelledAt", "createdAt");

-- CreateIndex
CREATE INDEX "SiteAnnouncementRecipient_userId_acknowledgedAt_createdAt_idx" ON "SiteAnnouncementRecipient"("userId", "acknowledgedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteAnnouncement" ADD CONSTRAINT "SiteAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAnnouncementRecipient" ADD CONSTRAINT "SiteAnnouncementRecipient_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "SiteAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAnnouncementRecipient" ADD CONSTRAINT "SiteAnnouncementRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
