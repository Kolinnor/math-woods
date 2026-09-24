-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "pollClosedAt" TIMESTAMP(3),
ADD COLUMN     "pollQuestion" TEXT;

-- CreateTable
CREATE TABLE "AnnouncementPollOption" (
    "id" SERIAL NOT NULL,
    "announcementId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AnnouncementPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementPollVote" (
    "announcementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "optionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementPollVote_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPollOption_announcementId_id_key" ON "AnnouncementPollOption"("announcementId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPollOption_announcementId_position_key" ON "AnnouncementPollOption"("announcementId", "position");

-- CreateIndex
CREATE INDEX "AnnouncementPollVote_announcementId_optionId_idx" ON "AnnouncementPollVote"("announcementId", "optionId");

-- CreateIndex
CREATE INDEX "AnnouncementPollVote_userId_idx" ON "AnnouncementPollVote"("userId");

-- AddForeignKey
ALTER TABLE "AnnouncementPollOption" ADD CONSTRAINT "AnnouncementPollOption_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_announcementId_optionId_fkey" FOREIGN KEY ("announcementId", "optionId") REFERENCES "AnnouncementPollOption"("announcementId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
