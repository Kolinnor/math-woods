CREATE TYPE "ChatReactionType" AS ENUM (
  'LIKE',
  'HEART',
  'DISLIKE',
  'SMILE',
  'LAUGH',
  'SURPRISE',
  'SAD',
  'THINKING',
  'CELEBRATE',
  'AGREE'
);

CREATE TABLE "ChatMessageReaction" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "reaction" "ChatReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageReaction_messageId_userId_reaction_key"
  ON "ChatMessageReaction"("messageId", "userId", "reaction");

CREATE INDEX "ChatMessageReaction_messageId_createdAt_idx"
  ON "ChatMessageReaction"("messageId", "createdAt");

CREATE INDEX "ChatMessageReaction_userId_createdAt_idx"
  ON "ChatMessageReaction"("userId", "createdAt");

ALTER TABLE "ChatMessageReaction"
  ADD CONSTRAINT "ChatMessageReaction_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageReaction"
  ADD CONSTRAINT "ChatMessageReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
