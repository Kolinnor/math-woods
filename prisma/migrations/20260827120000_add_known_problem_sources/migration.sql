-- Add a small admin-managed catalogue for recognizable problem sources.
CREATE TABLE "KnownProblemSource" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnownProblemSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnownProblemSource_slug_key" ON "KnownProblemSource"("slug");
CREATE INDEX "KnownProblemSource_active_name_idx" ON "KnownProblemSource"("active", "name");

ALTER TABLE "Problem" ADD COLUMN "knownSourceId" INTEGER;
CREATE INDEX "Problem_knownSourceId_idx" ON "Problem"("knownSourceId");
ALTER TABLE "Problem"
ADD CONSTRAINT "Problem_knownSourceId_fkey"
FOREIGN KEY ("knownSourceId") REFERENCES "KnownProblemSource"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "KnownProblemSource" ("slug", "name", "aliases", "updatedAt")
VALUES ('phil-caldero', 'Phil Caldero', ARRAY['Phil Caldero']::TEXT[], CURRENT_TIMESTAMP);

UPDATE "Problem"
SET "knownSourceId" = (
    SELECT "id" FROM "KnownProblemSource" WHERE "slug" = 'phil-caldero'
)
WHERE "translationGroupId" IN (
    SELECT DISTINCT "translationGroupId"
    FROM "Problem"
    WHERE LOWER(REGEXP_REPLACE(BTRIM("origin"), '\s+', ' ', 'g')) = 'phil caldero'
);
