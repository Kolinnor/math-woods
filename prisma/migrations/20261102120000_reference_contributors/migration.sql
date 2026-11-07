CREATE TABLE "LibraryReferenceContribution" (
    "referenceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "firstContributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LibraryReferenceContribution_pkey" PRIMARY KEY ("referenceId", "userId")
);
CREATE INDEX "LibraryReferenceContribution_userId_idx" ON "LibraryReferenceContribution"("userId");
ALTER TABLE "LibraryReferenceContribution" ADD CONSTRAINT "LibraryReferenceContribution_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryReferenceContribution" ADD CONSTRAINT "LibraryReferenceContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only credit people actually recorded in the existing data. Earlier editors
-- cannot be reconstructed because references did not retain an edit history.
INSERT INTO "LibraryReferenceContribution" ("referenceId", "userId", "firstContributedAt")
SELECT "id", "createdById", "createdAt" FROM "LibraryReference" WHERE "createdById" IS NOT NULL;
INSERT INTO "LibraryReferenceContribution" ("referenceId", "userId", "firstContributedAt", "reviewed")
SELECT "id", "reviewedById", "reviewedAt", true FROM "LibraryReference"
WHERE "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
  AND ("status" = 'PUBLISHED' OR ("status" = 'NEEDS_WORK' AND "reviewNote" IS NOT NULL))
ON CONFLICT ("referenceId", "userId") DO UPDATE SET "reviewed" = true;
