CREATE TABLE "TipImage" (
    "id" SERIAL NOT NULL,
    "tipId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT NOT NULL,
    "imagePositionX" INTEGER NOT NULL DEFAULT 50,
    "imagePositionY" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TipImage_tipId_position_key" ON "TipImage"("tipId", "position");
CREATE INDEX "TipImage_tipId_position_idx" ON "TipImage"("tipId", "position");

ALTER TABLE "TipImage"
ADD CONSTRAINT "TipImage_tipId_fkey"
FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TipImage" (
    "tipId",
    "position",
    "imageUrl",
    "imagePositionX",
    "imagePositionY",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    0,
    "imageUrl",
    "imagePositionX",
    "imagePositionY",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Tip"
WHERE "imageUrl" IS NOT NULL AND BTRIM("imageUrl") <> '';
