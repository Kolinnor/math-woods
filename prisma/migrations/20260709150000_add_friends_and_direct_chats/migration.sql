CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FRIEND_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT_MESSAGE';

CREATE TABLE "Friendship" (
  "id" SERIAL NOT NULL,
  "requesterId" INTEGER NOT NULL,
  "addresseeId" INTEGER NOT NULL,
  "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectChat" (
  "id" SERIAL NOT NULL,
  "userAId" INTEGER NOT NULL,
  "userBId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DirectChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" SERIAL NOT NULL,
  "directChatId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
CREATE INDEX "Friendship_addresseeId_status_updatedAt_idx" ON "Friendship"("addresseeId", "status", "updatedAt");
CREATE INDEX "Friendship_requesterId_status_updatedAt_idx" ON "Friendship"("requesterId", "status", "updatedAt");

CREATE UNIQUE INDEX "DirectChat_userAId_userBId_key" ON "DirectChat"("userAId", "userBId");
CREATE INDEX "DirectChat_userBId_idx" ON "DirectChat"("userBId");
CREATE INDEX "DirectChat_updatedAt_idx" ON "DirectChat"("updatedAt");

CREATE INDEX "ChatMessage_directChatId_createdAt_idx" ON "ChatMessage"("directChatId", "createdAt");
CREATE INDEX "ChatMessage_authorId_createdAt_idx" ON "ChatMessage"("authorId", "createdAt");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectChat" ADD CONSTRAINT "DirectChat_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectChat" ADD CONSTRAINT "DirectChat_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_directChatId_fkey" FOREIGN KEY ("directChatId") REFERENCES "DirectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
