ALTER TABLE "User" ADD COLUMN "displayNameChangedAt" TIMESTAMP(3);

CREATE TABLE "DisplayNameChange" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "oldDisplayName" TEXT NOT NULL,
    "newDisplayName" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayNameChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DisplayNameChange_userId_changedAt_idx" ON "DisplayNameChange"("userId", "changedAt");
CREATE INDEX "DisplayNameChange_changedAt_idx" ON "DisplayNameChange"("changedAt");

ALTER TABLE "DisplayNameChange"
ADD CONSTRAINT "DisplayNameChange_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DisplayNameChange"
ADD CONSTRAINT "DisplayNameChange_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
