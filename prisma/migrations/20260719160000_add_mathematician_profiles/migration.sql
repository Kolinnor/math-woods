ALTER TABLE "User"
  ADD COLUMN "affiliation" TEXT,
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "mathematicalDomains" "MathDomain"[] NOT NULL DEFAULT ARRAY[]::"MathDomain"[],
  ADD COLUMN "openToCollaboration" BOOLEAN NOT NULL DEFAULT false;
