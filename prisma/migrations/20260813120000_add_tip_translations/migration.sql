CREATE TABLE "TipTranslation" (
    "id" SERIAL NOT NULL,
    "tipId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TipTranslation_tipId_language_key"
ON "TipTranslation"("tipId", "language");
CREATE INDEX "TipTranslation_language_idx"
ON "TipTranslation"("language");

ALTER TABLE "TipTranslation"
ADD CONSTRAINT "TipTranslation_tipId_fkey"
FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TipTranslation" (
    "tipId",
    "language",
    "title",
    "body",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    'en',
    "title",
    "body",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Tip";

CREATE TABLE "TipProblemGroup" (
    "tipId" INTEGER NOT NULL,
    "translationGroupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TipProblemGroup_pkey" PRIMARY KEY ("tipId", "translationGroupId")
);

CREATE INDEX "TipProblemGroup_tipId_position_idx"
ON "TipProblemGroup"("tipId", "position");
CREATE INDEX "TipProblemGroup_translationGroupId_idx"
ON "TipProblemGroup"("translationGroupId");

ALTER TABLE "TipProblemGroup"
ADD CONSTRAINT "TipProblemGroup_tipId_fkey"
FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TipProblemGroup" ("tipId", "translationGroupId", "position")
SELECT DISTINCT ON (link."tipId", problem."translationGroupId")
    link."tipId",
    problem."translationGroupId",
    link."position"
FROM "TipProblem" AS link
INNER JOIN "Problem" AS problem ON problem."id" = link."problemId"
ORDER BY link."tipId", problem."translationGroupId", link."position", link."problemId";
