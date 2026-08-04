ALTER TABLE "ChatMessage"
ADD COLUMN "replyToId" INTEGER,
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_replyToId_fkey"
FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
