CREATE TYPE "ProblemVerificationMode" AS ENUM ('NONE', 'SELF_CHECK', 'AUTHOR_REVIEW');
CREATE TYPE "ProblemVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Problem" ADD COLUMN "verificationMode" "ProblemVerificationMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN "verificationPrompt" TEXT,
ADD COLUMN "verificationAnswer" TEXT;

CREATE TABLE "ProblemVerificationRequest" (
    "id" SERIAL NOT NULL,
    "problemId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "ProblemVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" INTEGER,
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProblemVerificationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProblemVerificationRequest_problemId_status_createdAt_idx" ON "ProblemVerificationRequest"("problemId", "status", "createdAt");
CREATE INDEX "ProblemVerificationRequest_userId_status_createdAt_idx" ON "ProblemVerificationRequest"("userId", "status", "createdAt");

ALTER TABLE "ProblemVerificationRequest" ADD CONSTRAINT "ProblemVerificationRequest_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemVerificationRequest" ADD CONSTRAINT "ProblemVerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemVerificationRequest" ADD CONSTRAINT "ProblemVerificationRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
