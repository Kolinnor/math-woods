CREATE TYPE "ExternalAuthProvider" AS ENUM ('GOOGLE', 'ORCID');

CREATE TABLE "ExternalIdentity" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "provider" "ExternalAuthProvider" NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "providerEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthAttempt" (
  "id" SERIAL NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "provider" "ExternalAuthProvider" NOT NULL,
  "codeVerifier" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "linkUserId" INTEGER,
  "providerAccountId" TEXT,
  "providerEmail" TEXT,
  "providerEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "providerDisplayName" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_providerAccountId_key"
  ON "ExternalIdentity"("provider", "providerAccountId");
CREATE UNIQUE INDEX "ExternalIdentity_userId_provider_key"
  ON "ExternalIdentity"("userId", "provider");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE UNIQUE INDEX "OAuthAttempt_tokenHash_key" ON "OAuthAttempt"("tokenHash");
CREATE INDEX "OAuthAttempt_expiresAt_idx" ON "OAuthAttempt"("expiresAt");
CREATE INDEX "OAuthAttempt_linkUserId_idx" ON "OAuthAttempt"("linkUserId");

ALTER TABLE "ExternalIdentity"
  ADD CONSTRAINT "ExternalIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthAttempt"
  ADD CONSTRAINT "OAuthAttempt_linkUserId_fkey"
  FOREIGN KEY ("linkUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
