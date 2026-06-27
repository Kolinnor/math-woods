ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VERIFICATION_MESSAGE';

CREATE TABLE "ProblemVerificationMessage" (
  "id" SERIAL NOT NULL,
  "requestId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProblemVerificationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemVerificationMessage_requestId_createdAt_idx" ON "ProblemVerificationMessage"("requestId", "createdAt");
CREATE INDEX "ProblemVerificationMessage_authorId_createdAt_idx" ON "ProblemVerificationMessage"("authorId", "createdAt");

ALTER TABLE "ProblemVerificationMessage"
  ADD CONSTRAINT "ProblemVerificationMessage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ProblemVerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProblemVerificationMessage"
  ADD CONSTRAINT "ProblemVerificationMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
