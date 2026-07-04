ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "User"
SET "deletedAt" = "updatedAt"
WHERE "deletedAt" IS NULL
  AND "email" IS NULL
  AND "passwordHash" IS NULL
  AND "username" LIKE 'deleted-user-%';
