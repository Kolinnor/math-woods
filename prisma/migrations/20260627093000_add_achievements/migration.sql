ALTER TYPE "NotificationType" ADD VALUE 'ACHIEVEMENT_UNLOCKED';

CREATE TABLE "AchievementUnlock" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AchievementUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AchievementUnlock_userId_key_key" ON "AchievementUnlock"("userId", "key");
CREATE INDEX "AchievementUnlock_userId_unlockedAt_idx" ON "AchievementUnlock"("userId", "unlockedAt");

ALTER TABLE "AchievementUnlock" ADD CONSTRAINT "AchievementUnlock_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
